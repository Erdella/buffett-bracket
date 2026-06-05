import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "node:http";
import express from "express";
import path from "node:path";
import fs from "node:fs";
import multer from "multer";
import { storage, db } from "./storage";
import {
  insertPlayerSchema, insertAlbumStatusSchema,
  bracketMatches, matchVotes,
} from "@shared/schema";
import { sql, eq } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import seedAlbums from "./seed-albums";
import { sendMagicLink, mailConfigured } from "./email";
import {
  buildRoundOne, derivePersonalBracket, computeStandings, resolveSeedOrder,
  computeOGLeaderboard, computeOGPairAgreement, computeOGTopPairs, totalMatchups,
  type OGAlbumInput,
} from "./community-bracket";

// Public base URL used to build magic links. Falls back to the request origin.
const APP_BASE_URL = (process.env.APP_BASE_URL || "").replace(/\/$/, "");
const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

// A member who has never set a real name keeps the auto-derived default
// (the part of their email before the "@"). We use that to know when to prompt
// a first-time signer to choose a display name. Mirrors storage.upsertMember's
// fallback: displayName || email.split("@")[0].
function nameIsPlaceholder(email: string, displayName: string): boolean {
  return displayName.trim() === email.split("@")[0];
}

// True when the given email belongs to one of the family players. Used to
// decide whether a signed-in member can see the otherwise-hidden family
// bracket and results. Case-insensitive, ignores blank player emails.
async function isFamilyEmail(email: string): Promise<boolean> {
  const e = email.trim().toLowerCase();
  if (!e) return false;
  const players = await storage.listPlayers();
  return players.some(p => (p.email ?? "").trim().toLowerCase() === e);
}

// Server-side gate for family-only data. A request is "family" when it's the
// admin, or a signed-in (non-blocked) member whose email matches a family
// player. Used to hide the family bracket lifecycle (status/winners) and the
// per-player favorites from outsiders at the API level, not just in the UI.
async function requestIsFamily(req: Request): Promise<boolean> {
  if (req.session.isAdmin) return true;
  if (!req.session.memberId) return false;
  const m = await storage.getMember(req.session.memberId);
  if (!m || m.blocked) return false;
  return isFamilyEmail(m.email);
}

// Resolve the effective avatar for an OG member: their own uploaded photo wins,
// otherwise fall back to the admin-panel photo of the family player they're
// linked to (same email, case-insensitive). Returns null when neither exists
// (the client then renders colored initials). `players` is passed in so callers
// that resolve many members at once only fetch the player list once.
function memberPhotoUrl(
  member: { email: string; photoUrl?: string | null },
  players: { email?: string | null; photoUrl?: string | null }[],
): string | null {
  if (member.photoUrl) return member.photoUrl;
  const e = (member.email ?? "").trim().toLowerCase();
  if (!e) return null;
  const linked = players.find(p => (p.email ?? "").trim().toLowerCase() === e);
  return linked?.photoUrl ?? null;
}

// Uploaded player avatars live next to data.db (cwd) so they share the
// Docker volume mount and survive image upgrades.
const UPLOAD_DIR = path.resolve("uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function imageUploader(prefix: string) {
  return multer({
    storage: multer.diskStorage({
      destination: UPLOAD_DIR,
      filename: (req, file, cb) => {
        const ext = (path.extname(file.originalname) || ".jpg").toLowerCase().slice(0, 5);
        const safeExt = /^\.(jpg|jpeg|png|webp|gif)$/.test(ext) ? ext : ".jpg";
        cb(null, `${prefix}${req.params.id}-${Date.now()}${safeExt}`);
      },
    }),
    limits: { fileSize: 6 * 1024 * 1024 }, // 6 MB ceiling
    fileFilter: (_req, file, cb) => {
      if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
      else cb(new Error("Only JPEG, PNG, WEBP, or GIF images are allowed."));
    },
  });
}
const photoUpload = imageUploader("p");
const coverUpload = imageUploader("album-");

// Member avatars are self-scoped: the filename uses the logged-in member's id
// (from the session) rather than a URL :id param.
const memberPhotoUpload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname) || ".jpg").toLowerCase().slice(0, 5);
      const safeExt = /^\.(jpg|jpeg|png|webp|gif)$/.test(ext) ? ext : ".jpg";
      const memberId = (req as Request).session?.memberId ?? "x";
      cb(null, `m${memberId}-${Date.now()}${safeExt}`);
    },
  }),
  limits: { fileSize: 6 * 1024 * 1024 }, // 6 MB ceiling
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPEG, PNG, WEBP, or GIF images are allowed."));
  },
});

// --- Admin auth ---
// Single-admin model: one bcrypt hash in env. The hash MUST be set; if it's
// missing the server logs a warning and refuses all logins.
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || "";
if (!ADMIN_PASSWORD_HASH) {
  console.warn(
    "\u26a0\ufe0f  ADMIN_PASSWORD_HASH is not set. Login is disabled. " +
      "Set it to a bcrypt hash to enable admin write access.",
  );
}

// Endpoints that a logged-in COMMUNITY MEMBER (not admin) may POST to.
// Everything else that mutates still requires admin.
const MEMBER_MUTATION_PATHS = [
  "/api/community/vote",
  "/api/community/favorite",
  "/api/community/pick",
  "/api/member/logout",
  "/api/member/profile",
  "/api/member/photo",
];
// Public (no-auth) mutation endpoints: the magic-link flow itself.
const PUBLIC_MUTATION_PATHS = [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/member/request-link",
  "/api/member/verify",
];

// Guard middleware: rejects mutating requests (POST/PATCH/PUT/DELETE) on /api/*
// unless allowed. Read endpoints stay public. Admin may mutate anything;
// logged-in members may hit the member endpoints; the magic-link flow is open.
function requireAuthForMutations(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith("/api")) return next();
  const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
  if (!isMutation) return next();
  if (PUBLIC_MUTATION_PATHS.includes(req.path)) return next();
  if (req.session.isAdmin) return next();
  // Member-scoped endpoints: allow if a member session exists.
  if (MEMBER_MUTATION_PATHS.includes(req.path) && req.session.memberId) return next();
  return res.status(401).json({ error: "Sign-in required" });
}

async function ensureSchemaAndSeed() {
  // Create tables if they don't exist (Drizzle better-sqlite3 doesn't auto-migrate).
  db.run(sql`CREATE TABLE IF NOT EXISTS albums (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    year INTEGER NOT NULL,
    order_index INTEGER NOT NULL,
    tracks TEXT NOT NULL,
    cover_url TEXT,
    seed_order TEXT
  )`);
  // Add cover_url / seed_order columns to existing album tables (idempotent).
  try {
    const cols = db.all(sql`PRAGMA table_info(albums)`) as Array<{ name: string }>;
    if (!cols.some(c => c.name === "cover_url")) {
      db.run(sql`ALTER TABLE albums ADD COLUMN cover_url TEXT`);
    }
    if (!cols.some(c => c.name === "seed_order")) {
      db.run(sql`ALTER TABLE albums ADD COLUMN seed_order TEXT`);
    }
  } catch (e) {
    console.warn("Could not check/add album columns:", e);
  }
  db.run(sql`CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#01696F',
    order_index INTEGER NOT NULL DEFAULT 0,
    photo_url TEXT,
    email TEXT
  )`);
  // Add photo_url + email columns to existing player tables (idempotent).
  try {
    const cols = db.all(sql`PRAGMA table_info(players)`) as Array<{ name: string }>;
    if (!cols.some(c => c.name === "photo_url")) {
      db.run(sql`ALTER TABLE players ADD COLUMN photo_url TEXT`);
    }
    if (!cols.some(c => c.name === "email")) {
      db.run(sql`ALTER TABLE players ADD COLUMN email TEXT`);
    }
  } catch (e) {
    console.warn("Could not check/add player columns:", e);
  }
  db.run(sql`CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    current_album_id INTEGER
  )`);
  db.run(sql`CREATE TABLE IF NOT EXISTS album_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    album_id INTEGER NOT NULL,
    player_id INTEGER NOT NULL,
    song_title TEXT NOT NULL
  )`);
  db.run(sql`CREATE TABLE IF NOT EXISTS album_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    album_id INTEGER NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'not_started',
    winning_song TEXT,
    runner_up_song TEXT,
    notes TEXT,
    completed_at TEXT
  )`);
  db.run(sql`CREATE TABLE IF NOT EXISTS bracket_matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    album_id INTEGER NOT NULL,
    round INTEGER NOT NULL,
    match_index INTEGER NOT NULL,
    song_a TEXT,
    song_b TEXT,
    winner TEXT
  )`);
  db.run(sql`CREATE TABLE IF NOT EXISTS match_votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL,
    player_id INTEGER NOT NULL,
    song_voted_for TEXT NOT NULL
  )`);
  db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_match_votes_match_player ON match_votes(match_id, player_id)`);

  // ----- community tables -----
  db.run(sql`CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    blocked INTEGER NOT NULL DEFAULT 0,
    photo_url TEXT
  )`);
  // Add photo_url column to existing members tables (idempotent).
  try {
    const memberCols = db.all(sql`PRAGMA table_info(members)`) as Array<{ name: string }>;
    if (!memberCols.some(c => c.name === "photo_url")) {
      db.run(sql`ALTER TABLE members ADD COLUMN photo_url TEXT`);
    }
  } catch (e) {
    console.warn("Could not check/add members.photo_url column:", e);
  }
  db.run(sql`CREATE TABLE IF NOT EXISTS login_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER
  )`);
  db.run(sql`CREATE TABLE IF NOT EXISTS community_round (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    album_id INTEGER,
    round INTEGER,
    is_open INTEGER NOT NULL DEFAULT 0
  )`);
  db.run(sql`CREATE TABLE IF NOT EXISTS community_votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    song_voted_for TEXT NOT NULL
  )`);
  db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_community_votes_match_member ON community_votes(match_id, member_id)`);
  db.run(sql`CREATE TABLE IF NOT EXISTS community_favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    album_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    song_title TEXT NOT NULL
  )`);
  db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_community_favorites_album_member ON community_favorites(album_id, member_id)`);
  db.run(sql`CREATE TABLE IF NOT EXISTS community_bracket_picks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    album_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    round INTEGER NOT NULL,
    match_index INTEGER NOT NULL,
    song_picked TEXT NOT NULL
  )`);
  db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_community_picks_unique ON community_bracket_picks(album_id, member_id, round, match_index)`);

  // Seed albums if empty
  const existing = await storage.listAlbums();
  if (existing.length === 0) {
    let i = 0;
    for (const a of seedAlbums) {
      await storage.createAlbum({
        title: a.title,
        year: a.year,
        orderIndex: i++,
        tracks: JSON.stringify(a.tracks),
      });
    }
  }

  // Data fix (idempotent): the original "Down to Earth" seed shipped the 11-track
  // 1970 original, but the album's canonical (1981/1998 re-release) order has 12
  // tracks, adding "Richard Frost" at position 3. Insert it if it's missing so
  // the community seeded bracket produces the expected 4 prelims + 4 quarters.
  try {
    const dte = (await storage.listAlbums()).find(a => a.title === "Down to Earth");
    if (dte) {
      const tracks = JSON.parse(dte.tracks) as string[];
      if (!tracks.includes("Richard Frost")) {
        const insertAt = tracks.indexOf("The Missionary");
        if (insertAt > 0) {
          tracks.splice(insertAt, 0, "Richard Frost");
          await storage.updateAlbum(dte.id, { tracks: JSON.stringify(tracks) });
        }
      }
    }
  } catch (e) {
    console.warn("Could not apply Down to Earth tracklist fix:", e);
  }

  // Seed players if empty
  const existingPlayers = await storage.listPlayers();
  if (existingPlayers.length === 0) {
    const defaults = [
      { name: "Tom",     color: "#01696F" }, // teal
      { name: "Renae",   color: "#A12C7B" }, // maroon
      { name: "Danielle",color: "#DA7101" }, // orange
      { name: "Jon",     color: "#006494" }, // blue
      { name: "Eric",    color: "#437A22" }, // green
    ];
    let idx = 0;
    for (const p of defaults) {
      await storage.createPlayer({ name: p.name, color: p.color, orderIndex: idx++ });
    }
  }
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  await ensureSchemaAndSeed();

  // Serve uploaded avatars publicly (read-only).
  app.use("/uploads", express.static(UPLOAD_DIR, { maxAge: "7d", immutable: false }));

  // Block mutations site-wide unless authorized (admin, member, or magic-link flow).
  app.use(requireAuthForMutations);

  // --- version / build info ---
  // Public. Surfaces the git commit + build time baked into the image at build
  // time, so you can confirm which build is actually running when troubleshooting.
  // Falls back to "dev" when running locally (env vars unset).
  app.get("/api/version", (_req, res) => {
    res.json({
      sha: process.env.GIT_SHA || "dev",
      buildTime: process.env.BUILD_TIME || null,
    });
  });

  // --- auth ---
  // Returns whether the current session is admin. Public; used by the client
  // to decide whether to render edit affordances.
  app.get("/api/auth/me", async (req, res) => {
    let member: { id: number; displayName: string; email: string; photoUrl: string | null; needsName: boolean } | null = null;
    if (req.session.memberId) {
      const m = await storage.getMember(req.session.memberId);
      if (m && !m.blocked) {
        const players = await storage.listPlayers();
        member = { id: m.id, displayName: m.displayName, email: m.email, photoUrl: memberPhotoUrl(m, players), needsName: nameIsPlaceholder(m.email, m.displayName) };
      } else {
        // Member was deleted or blocked since login — clear stale session.
        req.session.memberId = undefined;
      }
    }
    // A visitor is "family" if they're the admin, or a signed-in member whose
    // email matches one of the family players. Family-only content (the family
    // bracket, winners, and family leaderboard) is hidden from everyone else.
    const isFamily = await requestIsFamily(req);
    res.json({
      isAdmin: !!req.session.isAdmin,
      isFamily,
      authConfigured: !!ADMIN_PASSWORD_HASH,
      member,
      mailConfigured,
    });
  });
  app.post("/api/auth/login", async (req, res) => {
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!ADMIN_PASSWORD_HASH) {
      return res.status(503).json({ error: "Admin login is not configured on this server." });
    }
    const ok = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
    if (!ok) return res.status(401).json({ error: "Wrong password." });
    req.session.isAdmin = true;
    req.session.save(err => {
      if (err) return res.status(500).json({ error: "Could not save session." });
      res.json({ isAdmin: true });
    });
  });
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.clearCookie("buffett.sid");
      res.json({ ok: true });
    });
  });

  // --- albums ---
  app.get("/api/albums", async (_req, res) => {
    const list = await storage.listAlbums();
    res.json(list.map(a => ({ ...a, tracks: JSON.parse(a.tracks) as string[] })));
  });

  app.get("/api/albums/:id", async (req, res) => {
    const id = Number(req.params.id);
    const a = await storage.getAlbum(id);
    if (!a) return res.status(404).json({ error: "Album not found" });
    res.json({ ...a, tracks: JSON.parse(a.tracks) as string[] });
  });
  // Upload an album cover. Admin-only via the global mutation gate above.
  app.post("/api/albums/:id/cover", coverUpload.single("cover"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const album = await storage.getAlbum(id);
      if (!album) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return res.status(404).json({ error: "Album not found" });
      }
      if (!req.file) return res.status(400).json({ error: "No image uploaded." });
      if (album.coverUrl?.startsWith("/uploads/")) {
        const oldPath = path.join(UPLOAD_DIR, path.basename(album.coverUrl));
        fs.unlink(oldPath, () => {});
      }
      const coverUrl = `/uploads/${req.file.filename}`;
      const updated = await storage.updateAlbum(id, { coverUrl });
      res.json({ ...updated, tracks: JSON.parse(updated!.tracks) as string[] });
    } catch (e: any) {
      if (req.file) fs.unlink(req.file.path, () => {});
      res.status(400).json({ error: e?.message ?? "Upload failed." });
    }
  });
  app.delete("/api/albums/:id/cover", async (req, res) => {
    const id = Number(req.params.id);
    const album = await storage.getAlbum(id);
    if (!album) return res.status(404).json({ error: "Album not found" });
    if (album.coverUrl?.startsWith("/uploads/")) {
      const oldPath = path.join(UPLOAD_DIR, path.basename(album.coverUrl));
      fs.unlink(oldPath, () => {});
    }
    const updated = await storage.updateAlbum(id, { coverUrl: null });
    res.json({ ...updated, tracks: JSON.parse(updated!.tracks) as string[] });
  });

  // --- players ---
  app.get("/api/players", async (req, res) => {
    const players = await storage.listPlayers();
    // Family player emails are private linking info — only expose them to the
    // admin (who manages them). Everyone else gets the public fields.
    if (req.session.isAdmin) {
      res.json(players);
    } else {
      res.json(players.map(({ email, ...rest }) => rest));
    }
  });
  app.post("/api/players", async (req, res) => {
    try {
      const parsed = insertPlayerSchema.parse(req.body);
      res.json(await storage.createPlayer(parsed));
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });
  app.patch("/api/players/:id", async (req, res) => {
    const id = Number(req.params.id);
    const parsed = insertPlayerSchema.partial().parse(req.body);
    const updated = await storage.updatePlayer(id, parsed);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  });
  app.delete("/api/players/:id", async (req, res) => {
    await storage.deletePlayer(Number(req.params.id));
    res.json({ ok: true });
  });
  // Upload a profile photo for a player. Multer parses the multipart form;
  // requireAdminForMutations already gated this above.
  app.post("/api/players/:id/photo", photoUpload.single("photo"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const player = (await storage.listPlayers()).find(p => p.id === id);
      if (!player) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return res.status(404).json({ error: "Player not found" });
      }
      if (!req.file) return res.status(400).json({ error: "No image uploaded." });
      // Best-effort delete of the previous photo file.
      if (player.photoUrl?.startsWith("/uploads/")) {
        const oldPath = path.join(UPLOAD_DIR, path.basename(player.photoUrl));
        fs.unlink(oldPath, () => {});
      }
      const photoUrl = `/uploads/${req.file.filename}`;
      const updated = await storage.updatePlayer(id, { photoUrl });
      res.json(updated);
    } catch (e: any) {
      if (req.file) fs.unlink(req.file.path, () => {});
      res.status(400).json({ error: e?.message ?? "Upload failed." });
    }
  });
  app.delete("/api/players/:id/photo", async (req, res) => {
    const id = Number(req.params.id);
    const player = (await storage.listPlayers()).find(p => p.id === id);
    if (!player) return res.status(404).json({ error: "Player not found" });
    if (player.photoUrl?.startsWith("/uploads/")) {
      const oldPath = path.join(UPLOAD_DIR, path.basename(player.photoUrl));
      fs.unlink(oldPath, () => {});
    }
    const updated = await storage.updatePlayer(id, { photoUrl: null });
    res.json(updated);
  });

  // --- settings ---
  app.get("/api/settings", async (_req, res) => {
    res.json({ currentAlbumId: await storage.getCurrentAlbumId() });
  });
  app.post("/api/settings/current-album", async (req, res) => {
    const schema = z.object({ albumId: z.number().nullable() });
    const { albumId } = schema.parse(req.body);
    await storage.setCurrentAlbumId(albumId);
    if (albumId) {
      // Mark album as in_progress if not already completed
      const status = await storage.getAlbumStatus(albumId);
      if (!status || status.status === "not_started") {
        await storage.upsertAlbumStatus({
          albumId,
          status: "in_progress",
          winningSong: status?.winningSong ?? null,
          runnerUpSong: status?.runnerUpSong ?? null,
          notes: status?.notes ?? null,
          completedAt: status?.completedAt ?? null,
        });
      }
    }
    res.json({ ok: true });
  });

  // --- album status (FAMILY-ONLY: bracket lifecycle + winners) ---
  // Outsiders get an empty list / null so the family contest's progress and
  // crowned songs stay hidden even from direct API access.
  app.get("/api/album-status", async (req, res) => {
    if (!(await requestIsFamily(req))) return res.json([]);
    res.json(await storage.listAlbumStatuses());
  });
  app.get("/api/albums/:id/status", async (req, res) => {
    if (!(await requestIsFamily(req))) return res.json(null);
    const id = Number(req.params.id);
    res.json(await storage.getAlbumStatus(id) ?? null);
  });
  app.post("/api/albums/:id/status", async (req, res) => {
    const id = Number(req.params.id);
    const parsed = insertAlbumStatusSchema.partial({ albumId: true }).parse(req.body);
    const result = await storage.upsertAlbumStatus({
      albumId: id,
      status: parsed.status ?? "in_progress",
      winningSong: parsed.winningSong ?? null,
      runnerUpSong: parsed.runnerUpSong ?? null,
      notes: parsed.notes ?? null,
      completedAt: parsed.completedAt ?? null,
    });
    res.json(result);
  });

  // --- album results (FAMILY-ONLY: per-player favorite) ---
  app.get("/api/albums/:id/results", async (req, res) => {
    if (!(await requestIsFamily(req))) return res.json([]);
    res.json(await storage.listAlbumResults(Number(req.params.id)));
  });
  app.get("/api/results", async (req, res) => {
    if (!(await requestIsFamily(req))) return res.json([]);
    res.json(await storage.listAllResults());
  });
  app.post("/api/albums/:id/results", async (req, res) => {
    const albumId = Number(req.params.id);
    const schema = z.object({ playerId: z.number(), songTitle: z.string().min(1) });
    const { playerId, songTitle } = schema.parse(req.body);
    const r = await storage.upsertAlbumResult({ albumId, playerId, songTitle });
    res.json(r);
  });
  app.delete("/api/albums/:id/results/:playerId", async (req, res) => {
    await storage.deleteAlbumResult(Number(req.params.id), Number(req.params.playerId));
    res.json({ ok: true });
  });

  // --- bracket ---
  // Brackets are now built one round at a time. The user pastes the matchups
  // (typically generated by AI) for each round, marks winners, then adds the
  // next round when ready. No auto-generation, no auto-propagation.
  app.get("/api/albums/:id/bracket", async (req, res) => {
    // FAMILY-ONLY: the closed family bracket matchups. Outsiders see nothing.
    if (!(await requestIsFamily(req))) return res.json([]);
    res.json(await storage.listBracketMatches(Number(req.params.id)));
  });

  // Append (or replace) a single round of matchups.
  app.post("/api/albums/:id/bracket/round", async (req, res) => {
    try {
      const albumId = Number(req.params.id);
      const schema = z.object({
        round: z.number().int().positive(),
        matchups: z.array(z.object({
          songA: z.string().min(1),
          songB: z.string().min(1),
        })).min(1),
      });
      const { round, matchups } = schema.parse(req.body);
      // Mark album as in_progress when bracket activity starts (if not completed).
      const status = await storage.getAlbumStatus(albumId);
      if (!status || status.status === "not_started") {
        await storage.upsertAlbumStatus({
          albumId,
          status: "in_progress",
          winningSong: status?.winningSong ?? null,
          runnerUpSong: status?.runnerUpSong ?? null,
          notes: status?.notes ?? null,
          completedAt: status?.completedAt ?? null,
        });
      }
      const inserted = await storage.appendBracketRound(albumId, round, matchups);
      res.json(inserted);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Delete a specific round (e.g. to redo it).
  app.delete("/api/albums/:id/bracket/rounds/:round", async (req, res) => {
    await storage.deleteBracketRound(Number(req.params.id), Number(req.params.round));
    res.json({ ok: true });
  });

  app.delete("/api/albums/:id/bracket", async (req, res) => {
    await storage.clearBracket(Number(req.params.id));
    res.json({ ok: true });
  });

  // --- votes ---
  // List all votes across all albums (used for stats), bundled with all bracket
  // matches so the client can correlate vote → match → winner.
  app.get("/api/votes", async (req, res) => {
    // FAMILY-ONLY: the 5 family voters' bracket votes. Hidden from outsiders.
    if (!(await requestIsFamily(req))) return res.json({ matches: [], votes: [] });
    const allVotes = await storage.listAllVotes();
    const allMatches = db.select().from(bracketMatches).all();
    res.json({ matches: allMatches, votes: allVotes });
  });
  // List votes for one album's matches.
  app.get("/api/albums/:id/votes", async (req, res) => {
    // FAMILY-ONLY: family voter votes for one album. Hidden from outsiders.
    if (!(await requestIsFamily(req))) return res.json([]);
    res.json(await storage.listVotesForAlbum(Number(req.params.id)));
  });
  // Cast or update a vote.
  app.post("/api/match-votes", async (req, res) => {
    try {
      const schema = z.object({
        matchId: z.number().int().positive(),
        playerId: z.number().int().positive(),
        songVotedFor: z.string().min(1),
      });
      const { matchId, playerId, songVotedFor } = schema.parse(req.body);
      const m = db.select().from(bracketMatches).where(eq(bracketMatches.id, matchId)).get();
      if (!m) return res.status(404).json({ error: "Match not found" });
      if (songVotedFor !== m.songA && songVotedFor !== m.songB) {
        return res.status(400).json({ error: "Vote must be for one of the two songs in the match" });
      }
      const v = await storage.upsertVote(matchId, playerId, songVotedFor);
      await recomputeMatchWinner(matchId);
      res.json(v);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });
  // Clear a vote.
  app.delete("/api/match-votes/:matchId/:playerId", async (req, res) => {
    const matchId = Number(req.params.matchId);
    const playerId = Number(req.params.playerId);
    await storage.deleteVote(matchId, playerId);
    await recomputeMatchWinner(matchId);
    res.json({ ok: true });
  });

  // ========================================================================
  // COMMUNITY: magic-link auth
  // ========================================================================

  // Request a magic link. Open to anyone. Always responds 200 (don't reveal
  // whether an address exists) but returns the dev link when mail is unconfigured.
  app.post("/api/member/request-link", async (req, res) => {
    try {
      const schema = z.object({
        email: z.string().email().max(200),
        displayName: z.string().trim().max(60).optional(),
      });
      const parsed = schema.parse(req.body);
      const email = parsed.email.trim().toLowerCase();

      // Pre-create/update the member so the display name is captured at request time.
      const member = await storage.upsertMember(email, parsed.displayName?.trim() || "");
      if (member.blocked) {
        // Pretend success; don't send.
        return res.json({ ok: true });
      }

      const token = crypto.randomBytes(32).toString("base64url");
      await storage.createLoginToken(token, email, Date.now() + TOKEN_TTL_MS);

      const base = APP_BASE_URL || `${req.protocol}://${req.get("host")}`;
      // Token is base64url (URL-safe: A-Z a-z 0-9 - _), so it is safe as a path
      // segment. We use a path param (not a query string) because the hash router
      // matches on the hash path and would otherwise treat "?token=" as part of it.
      const link = `${base}/#/verify/${token}`;
      const result = await sendMagicLink(email, link);
      if (!result.ok) {
        return res.status(502).json({ error: result.error ?? "Could not send email." });
      }
      // In dev mode (no API key) surface the link so it can be followed without email.
      res.json({ ok: true, devLink: result.devLink });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Verify a magic-link token and start a member session.
  app.post("/api/member/verify", async (req, res) => {
    try {
      const schema = z.object({ token: z.string().min(10) });
      const { token } = schema.parse(req.body);
      const row = await storage.getLoginToken(token);
      if (!row) return res.status(400).json({ error: "This sign-in link is invalid." });
      if (row.usedAt) return res.status(400).json({ error: "This sign-in link has already been used." });
      if (row.expiresAt < Date.now()) return res.status(400).json({ error: "This sign-in link has expired. Request a new one." });

      await storage.consumeLoginToken(token);
      const member = await storage.upsertMember(row.email, "");
      if (member.blocked) return res.status(403).json({ error: "This account has been blocked." });

      req.session.memberId = member.id;
      const players = await storage.listPlayers();
      req.session.save(err => {
        if (err) return res.status(500).json({ error: "Could not start your session." });
        res.json({ member: { id: member.id, displayName: member.displayName, email: member.email, photoUrl: memberPhotoUrl(member, players), needsName: nameIsPlaceholder(member.email, member.displayName) } });
      });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post("/api/member/logout", (req, res) => {
    req.session.memberId = undefined;
    req.session.save(() => res.json({ ok: true }));
  });

  // Update own display name.
  app.post("/api/member/profile", async (req, res) => {
    if (!req.session.memberId) return res.status(401).json({ error: "Sign-in required" });
    const schema = z.object({ displayName: z.string().trim().min(1).max(60) });
    const { displayName } = schema.parse(req.body);
    const m = await storage.getMember(req.session.memberId);
    if (!m) return res.status(404).json({ error: "Member not found" });
    const updated = await storage.upsertMember(m.email, displayName);
    res.json({ member: { id: updated.id, displayName: updated.displayName, email: updated.email, photoUrl: updated.photoUrl ?? null, needsName: nameIsPlaceholder(updated.email, updated.displayName) } });
  });

  // Upload (or replace) the logged-in member's own profile photo. Self-scoped
  // via the session — a member can only change their own avatar.
  app.post("/api/member/photo", memberPhotoUpload.single("photo"), async (req, res) => {
    try {
      if (!req.session.memberId) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return res.status(401).json({ error: "Sign-in required" });
      }
      const m = await storage.getMember(req.session.memberId);
      if (!m) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return res.status(404).json({ error: "Member not found" });
      }
      if (!req.file) return res.status(400).json({ error: "No image uploaded." });
      // Best-effort delete of the previous photo file.
      if (m.photoUrl?.startsWith("/uploads/")) {
        const oldPath = path.join(UPLOAD_DIR, path.basename(m.photoUrl));
        fs.unlink(oldPath, () => {});
      }
      const photoUrl = `/uploads/${req.file.filename}`;
      const updated = await storage.updateMember(m.id, { photoUrl });
      res.json({ member: { id: updated!.id, displayName: updated!.displayName, email: updated!.email, photoUrl: updated!.photoUrl ?? null, needsName: nameIsPlaceholder(updated!.email, updated!.displayName) } });
    } catch (e: any) {
      if (req.file) fs.unlink(req.file.path, () => {});
      res.status(400).json({ error: e?.message ?? "Upload failed." });
    }
  });

  // Remove the logged-in member's own profile photo.
  app.delete("/api/member/photo", async (req, res) => {
    if (!req.session.memberId) return res.status(401).json({ error: "Sign-in required" });
    const m = await storage.getMember(req.session.memberId);
    if (!m) return res.status(404).json({ error: "Member not found" });
    if (m.photoUrl?.startsWith("/uploads/")) {
      const oldPath = path.join(UPLOAD_DIR, path.basename(m.photoUrl));
      fs.unlink(oldPath, () => {});
    }
    const updated = await storage.updateMember(m.id, { photoUrl: null });
    res.json({ member: { id: updated!.id, displayName: updated!.displayName, email: updated!.email, photoUrl: updated!.photoUrl ?? null, needsName: nameIsPlaceholder(updated!.email, updated!.displayName) } });
  });

  // ========================================================================
  // COMMUNITY: round state (which match is open for community voting)
  // ========================================================================
  app.get("/api/community/round", async (_req, res) => {
    res.json(await storage.getCommunityRound());
  });

  // Admin opens/sets the current community round. Mutation gate => admin only.
  app.post("/api/community/round", async (req, res) => {
    const schema = z.object({
      albumId: z.number().int().positive().nullable(),
      round: z.number().int().positive().nullable(),
      isOpen: z.boolean(),
    });
    const { albumId, round, isOpen } = schema.parse(req.body);
    await storage.setCommunityRound(albumId, round, isOpen);
    res.json(await storage.getCommunityRound());
  });

  // Admin closes the current community round AND locks in winners for that
  // round's matches based on the community plurality. This writes the winner
  // onto the bracket_matches rows (shared with the family bracket display),
  // so be aware it can overwrite a family-decided winner for the same match.
  // To avoid clobbering, we ONLY set winners that are currently null.
  app.post("/api/community/round/close", async (req, res) => {
    const cur = await storage.getCommunityRound();
    if (cur.albumId == null || cur.round == null) {
      return res.status(400).json({ error: "No community round is set." });
    }
    const matches = (await storage.listBracketMatches(cur.albumId)).filter(m => m.round === cur.round);
    const votes = await storage.listCommunityVotesForAlbum(cur.albumId);
    const lockOverwrite = req.body?.overwriteFamilyWinners === true;
    for (const m of matches) {
      const mv = votes.filter(v => v.matchId === m.id);
      const counts: Record<string, number> = {};
      for (const v of mv) counts[v.songVotedFor] = (counts[v.songVotedFor] ?? 0) + 1;
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      let winner: string | null = null;
      if (sorted.length === 1) winner = sorted[0][0];
      else if (sorted.length >= 2 && sorted[0][1] > sorted[1][1]) winner = sorted[0][0];
      if (winner && (lockOverwrite || !m.winner)) {
        await storage.updateMatchWinner(m.id, winner);
      }
    }
    await storage.setCommunityRound(cur.albumId, cur.round, false);
    res.json(await storage.getCommunityRound());
  });

  // ========================================================================
  // COMMUNITY: voting
  // ========================================================================

  // Tallies for an album's community votes, plus the current round state.
  // Returns per-match vote counts and the winning song where decided.
  app.get("/api/albums/:id/community", async (req, res) => {
    const albumId = Number(req.params.id);
    const matches = (await storage.listBracketMatches(albumId));
    const votes = await storage.listCommunityVotesForAlbum(albumId);
    const round = await storage.getCommunityRound();

    const tallies = matches.map(m => {
      const mv = votes.filter(v => v.matchId === m.id);
      const aVotes = mv.filter(v => v.songVotedFor === m.songA).length;
      const bVotes = mv.filter(v => v.songVotedFor === m.songB).length;
      let leader: string | null = null;
      if (aVotes > bVotes) leader = m.songA;
      else if (bVotes > aVotes) leader = m.songB;
      return {
        matchId: m.id, round: m.round, matchIndex: m.matchIndex,
        songA: m.songA, songB: m.songB,
        aVotes, bVotes, total: mv.length, leader,
      };
    });

    // Member's own votes for this album (if logged in).
    let myVotes: Record<number, string> = {};
    if (req.session.memberId) {
      for (const v of votes.filter(v => v.memberId === req.session.memberId)) {
        myVotes[v.matchId] = v.songVotedFor;
      }
    }
    res.json({ round, tallies, myVotes });
  });

  // Cast / change a community vote. Member-only (gated above). Only allowed
  // while the round is OPEN and the match belongs to the open round.
  app.post("/api/community/vote", async (req, res) => {
    try {
      const schema = z.object({
        matchId: z.number().int().positive(),
        songVotedFor: z.string().min(1),
      });
      const { matchId, songVotedFor } = schema.parse(req.body);
      const memberId = req.session.memberId!;

      const m = db.select().from(bracketMatches).where(eq(bracketMatches.id, matchId)).get();
      if (!m) return res.status(404).json({ error: "Match not found" });
      if (songVotedFor !== m.songA && songVotedFor !== m.songB) {
        return res.status(400).json({ error: "Vote must be for one of the two songs in the match." });
      }
      const round = await storage.getCommunityRound();
      if (!round.isOpen || round.albumId !== m.albumId || round.round !== m.round) {
        return res.status(403).json({ error: "Voting for this round is closed." });
      }
      const v = await storage.upsertCommunityVote(matchId, memberId, songVotedFor);
      res.json(v);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ========================================================================
  // COMMUNITY: album favorites
  // ========================================================================

  // Aggregated favorites for an album + the member's own pick.
  app.get("/api/albums/:id/community-favorites", async (req, res) => {
    const albumId = Number(req.params.id);
    const favs = await storage.listCommunityFavorites(albumId);

    // Resolve each favorite to a non-blocked member with their effective avatar
    // (own photo → linked family-player photo → initials). Build a lookup once.
    const allMembers = await storage.listMembers();
    const players = await storage.listPlayers();
    const memberById = new Map(allMembers.map(m => [m.id, m]));

    const counts: Record<string, number> = {};
    const votersBySong: Record<string, { id: number; displayName: string; photoUrl: string | null }[]> = {};
    for (const f of favs) {
      const m = memberById.get(f.memberId);
      if (!m || m.blocked) continue; // hide blocked members from the crowd row
      counts[f.songTitle] = (counts[f.songTitle] ?? 0) + 1;
      (votersBySong[f.songTitle] ??= []).push({
        id: m.id,
        displayName: m.displayName,
        photoUrl: memberPhotoUrl(m, players),
      });
    }
    // Stable, friendly order for each song's avatar row.
    for (const song of Object.keys(votersBySong)) {
      votersBySong[song].sort((a, b) => a.displayName.localeCompare(b.displayName));
    }

    const ranked = Object.entries(counts)
      .map(([songTitle, count]) => ({ songTitle, count, voters: votersBySong[songTitle] ?? [] }))
      .sort((a, b) => b.count - a.count);
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    let myFavorite: string | null = null;
    if (req.session.memberId) {
      myFavorite = favs.find(f => f.memberId === req.session.memberId)?.songTitle ?? null;
    }
    res.json({ total, ranked, myFavorite });
  });

  // Set the member's own favorite song for an album.
  app.post("/api/community/favorite", async (req, res) => {
    const schema = z.object({
      albumId: z.number().int().positive(),
      songTitle: z.string().min(1),
    });
    const { albumId, songTitle } = schema.parse(req.body);
    const album = await storage.getAlbum(albumId);
    if (!album) return res.status(404).json({ error: "Album not found" });
    const tracks = JSON.parse(album.tracks) as string[];
    if (!tracks.includes(songTitle)) {
      return res.status(400).json({ error: "That song isn't on this album." });
    }
    const f = await storage.upsertCommunityFavorite(albumId, req.session.memberId!, songTitle);
    res.json(f);
  });

  // ========================================================================
  // COMMUNITY: per-member personal bracket + weighted standings (NEW MODEL)
  // ------------------------------------------------------------------------
  // Everyone starts from the same round-1 pairings (the family bracket's
  // round 1, or auto-generated from the tracklist). Each member picks winners
  // all the way through THEIR OWN bracket; their picks advance on their own
  // copy. Album results are scored with weighted points (early=1, semis=2,
  // championship=4).
  // ========================================================================

  // The signed-in member's personal bracket for an album: the matchups they
  // currently face round-by-round, plus which song they've picked in each.
  app.get("/api/albums/:id/my-bracket", async (req, res) => {
    const albumId = Number(req.params.id);
    const album = await storage.getAlbum(albumId);
    if (!album) return res.status(404).json({ error: "Album not found" });
    const tracks = JSON.parse(album.tracks) as string[];
    const seeded = buildRoundOne(album.seedOrder, tracks);

    if (seeded.roundOne.length === 0) {
      return res.json({ available: false, bracket: null });
    }

    const picks = req.session.memberId
      ? await storage.listCommunityPicksForMember(albumId, req.session.memberId)
      : [];
    const bracket = derivePersonalBracket(seeded, picks);
    res.json({ available: true, bracket });
  });

  // Submit / change a pick on the member's personal bracket. Picking a winner
  // in round N invalidates that member's downstream picks (rounds > N) because
  // their bracket re-derives from this pick — so we clear them.
  app.post("/api/community/pick", async (req, res) => {
    try {
      const schema = z.object({
        albumId: z.number().int().positive(),
        round: z.number().int().positive(),
        matchIndex: z.number().int().min(0),
        songPicked: z.string().min(1),
      });
      const { albumId, round, matchIndex, songPicked } = schema.parse(req.body);
      const memberId = req.session.memberId!;

      const album = await storage.getAlbum(albumId);
      if (!album) return res.status(404).json({ error: "Album not found" });
      const tracks = JSON.parse(album.tracks) as string[];
      const seeded = buildRoundOne(album.seedOrder, tracks);
      if (seeded.roundOne.length === 0) {
        return res.status(400).json({ error: "No bracket exists for this album yet." });
      }

      // Re-derive the member's current bracket and validate the pick is for a
      // matchup that actually exists for them, with one of its two songs.
      const existingPicks = await storage.listCommunityPicksForMember(albumId, memberId);
      const bracket = derivePersonalBracket(seeded, existingPicks);
      const roundMatches = bracket.rounds[round - 1];
      if (!roundMatches) {
        return res.status(400).json({ error: "That round isn't open on your bracket yet." });
      }
      const match = roundMatches.find(m => m.matchIndex === matchIndex);
      if (!match) {
        return res.status(400).json({ error: "That matchup isn't on your bracket yet." });
      }
      if (songPicked !== match.songA && songPicked !== match.songB) {
        return res.status(400).json({ error: "Pick must be one of the two songs in that matchup." });
      }

      // If this changes an existing pick, clear downstream picks (rounds > round)
      // so the bracket re-derives cleanly. Only clear when the pick actually
      // changed to avoid wiping work on a no-op re-submit.
      const prior = existingPicks.find(p => p.round === round && p.matchIndex === matchIndex);
      if (prior && prior.songPicked !== songPicked) {
        await storage.deleteCommunityPicksFromRound(albumId, memberId, round + 1);
      }
      const saved = await storage.upsertCommunityPick(albumId, memberId, round, matchIndex, songPicked);

      // Return the freshly re-derived bracket so the client updates in one round-trip.
      const updatedPicks = await storage.listCommunityPicksForMember(albumId, memberId);
      const updated = derivePersonalBracket(seeded, updatedPicks);
      res.json({ saved, bracket: updated });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Weighted community standings for an album: ranked songs with points and a
  // per-round breakdown, the crowned winner, and participation count.
  app.get("/api/albums/:id/community-standings", async (req, res) => {
    const albumId = Number(req.params.id);
    const album = await storage.getAlbum(albumId);
    if (!album) return res.status(404).json({ error: "Album not found" });
    const tracks = JSON.parse(album.tracks) as string[];
    const seeded = buildRoundOne(album.seedOrder, tracks);
    const allPicks = await storage.listCommunityPicksForAlbum(albumId);
    const standings = computeStandings(seeded.totalRounds, allPicks);
    res.json({ ...standings, hasPrelims: seeded.hasPrelims });
  });

  // The OG members who have participated in an album: anyone who has made at
  // least one bracket pick OR set a favorite song for it. Returns lightweight
  // avatar info (id, display name, photo) so the album page can show a row of
  // who's voted. Blocked members are excluded. Public (no auth).
  app.get("/api/albums/:id/voters", async (req, res) => {
    const albumId = Number(req.params.id);
    const album = await storage.getAlbum(albumId);
    if (!album) return res.status(404).json({ error: "Album not found" });

    const picks = await storage.listCommunityPicksForAlbum(albumId);
    const favs = await storage.listCommunityFavorites(albumId);
    const memberIds = new Set<number>();
    for (const p of picks) memberIds.add(p.memberId);
    for (const f of favs) memberIds.add(f.memberId);

    const members = (await storage.listMembers()).filter(m => memberIds.has(m.id) && !m.blocked);
    members.sort((a, b) => a.displayName.localeCompare(b.displayName));
    const players = await storage.listPlayers();
    res.json({
      total: members.length,
      voters: members.map(m => ({ id: m.id, displayName: m.displayName, photoUrl: memberPhotoUrl(m, players) })),
    });
  });

  // ========================================================================
  // ADMIN: per-album community bracket SEEDING
  // The seed order is the source of truth for the seeded play-in bracket.
  // ========================================================================

  // Current seed order for an album, plus the structure it produces. Returns
  // the resolved order (admin-set, or track-order default) so the UI never has
  // to guess. `isCustom` is true when an explicit seed order has been saved.
  app.get("/api/albums/:id/seeds", async (req, res) => {
    const albumId = Number(req.params.id);
    const album = await storage.getAlbum(albumId);
    if (!album) return res.status(404).json({ error: "Album not found" });
    const tracks = JSON.parse(album.tracks) as string[];
    const seedOrder = resolveSeedOrder(album.seedOrder, tracks);
    const seeded = buildRoundOne(album.seedOrder, tracks);
    res.json({
      seedOrder,
      isCustom: !!album.seedOrder,
      totalRounds: seeded.totalRounds,
      hasPrelims: seeded.hasPrelims,
      prelimGames: seeded.hasPrelims ? seeded.roundOne.length : 0,
      roundOne: seeded.roundOne,
    });
  });

  // Set (or reset) an album's seed order. Admin-only via the mutation gate.
  // Body { seedOrder: string[] } sets a custom order; { seedOrder: null }
  // clears it back to the track-order default. The submitted order must be a
  // permutation of the album's tracklist.
  app.put("/api/albums/:id/seeds", async (req, res) => {
    try {
      const albumId = Number(req.params.id);
      const album = await storage.getAlbum(albumId);
      if (!album) return res.status(404).json({ error: "Album not found" });
      const tracks = JSON.parse(album.tracks) as string[];

      const schema = z.object({
        seedOrder: z.array(z.string().min(1)).nullable(),
      });
      const { seedOrder } = schema.parse(req.body);

      if (seedOrder === null) {
        const updated = await storage.updateAlbum(albumId, { seedOrder: null });
        const tr = JSON.parse(updated!.tracks) as string[];
        return res.json({ seedOrder: resolveSeedOrder(null, tr), isCustom: false });
      }

      // Validate the submitted order is a permutation of the tracklist.
      const trackSet = new Set(tracks);
      const seen = new Set<string>();
      for (const t of seedOrder) {
        if (!trackSet.has(t)) {
          return res.status(400).json({ error: `"${t}" isn't a track on this album.` });
        }
        if (seen.has(t)) {
          return res.status(400).json({ error: `"${t}" appears more than once in the seed order.` });
        }
        seen.add(t);
      }
      if (seen.size !== tracks.length) {
        return res.status(400).json({ error: "Seed order must include every song on the album exactly once." });
      }

      const updated = await storage.updateAlbum(albumId, { seedOrder: JSON.stringify(seedOrder) });
      const tr = JSON.parse(updated!.tracks) as string[];
      res.json({ seedOrder: resolveSeedOrder(updated!.seedOrder, tr), isCustom: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ========================================================================
  // OG PARROTHEAD MADNESS: public leaderboard
  // ------------------------------------------------------------------------
  // One read endpoint powering the OG view of the Leaderboard page. Returns
  // the member roster (id + display name only), per-member computed metrics
  // (champion accuracy, consensus score, round-1 agreement, per-album detail),
  // each album's community winner, and every member's per-album favorite song.
  // Public (no auth) since the family leaderboard is public too.
  // ========================================================================

  // Helper: assemble the per-album community inputs once (shared by the two
  // OG leaderboard endpoints below).
  async function buildOGAlbumInputs(): Promise<OGAlbumInput[]> {
    const albumList = await storage.listAlbums();
    const allPicks = await storage.listAllCommunityPicks();
    const picksByAlbum = new Map<number, typeof allPicks>();
    for (const p of allPicks) {
      const arr = picksByAlbum.get(p.albumId) ?? [];
      arr.push(p);
      picksByAlbum.set(p.albumId, arr);
    }
    return albumList.map(a => ({
      albumId: a.id,
      seedOrderJson: a.seedOrder,
      tracks: JSON.parse(a.tracks) as string[],
      picks: picksByAlbum.get(a.id) ?? [],
    }));
  }

  // Personalized progress for the signed-in member across every album: how many
  // picks they've made vs. the total their bracket needs, plus their crowned
  // champion when finished. Powers the "My Brackets" dashboard. 401 if signed out.
  app.get("/api/community/my-progress", async (req, res) => {
    const memberId = req.session.memberId;
    if (!memberId) return res.status(401).json({ error: "Not signed in." });

    const albumList = await storage.listAlbums();
    const allPicks = await storage.listCommunityPicksForMemberAll(memberId);
    const picksByAlbum = new Map<number, typeof allPicks>();
    for (const p of allPicks) {
      const arr = picksByAlbum.get(p.albumId) ?? [];
      arr.push(p);
      picksByAlbum.set(p.albumId, arr);
    }

    let completedAlbums = 0;
    let availableAlbums = 0;
    const albums = albumList.map(a => {
      const tracks = JSON.parse(a.tracks) as string[];
      const total = totalMatchups(a.seedOrder, tracks);
      const available = total > 0;
      if (available) availableAlbums += 1;
      const picks = picksByAlbum.get(a.id) ?? [];
      const seeded = buildRoundOne(a.seedOrder, tracks);
      const bracket = available
        ? derivePersonalBracket(seeded, picks)
        : null;
      // Made picks are capped at total (defensive — stale downstream picks are
      // cleared on change, but never report more than the bracket needs).
      const made = Math.min(picks.length, total);
      const complete = !!bracket?.complete;
      if (complete) completedAlbums += 1;
      const status = !available
        ? "unavailable"
        : complete
          ? "done"
          : made > 0
            ? "in_progress"
            : "not_started";
      return {
        albumId: a.id,
        title: a.title,
        year: a.year,
        available,
        totalPicks: total,
        madePicks: made,
        complete,
        champion: bracket?.champion ?? null,
        status,
      };
    });

    res.json({
      totalAlbums: albumList.length,
      availableAlbums,
      completedAlbums,
      albums,
    });
  });

  app.get("/api/community/leaderboard", async (_req, res) => {
    const members = (await storage.listMembers()).filter(m => !m.blocked);
    const memberIds = members.map(m => m.id);
    const albumInputs = await buildOGAlbumInputs();

    const { perMember, albumWinners } = computeOGLeaderboard(memberIds, albumInputs);
    // Real pairwise round-1 agreement (round 1 is the only fully-shared round).
    const topPairs = computeOGTopPairs(memberIds, albumInputs, 10);

    // Per-member favorite song per album.
    const allFavs = await storage.listAllCommunityFavorites();
    const favorites = allFavs.map(f => ({
      memberId: f.memberId,
      albumId: f.albumId,
      songTitle: f.songTitle,
    }));

    const players = await storage.listPlayers();
    res.json({
      members: members.map(m => ({ id: m.id, displayName: m.displayName, photoUrl: memberPhotoUrl(m, players) })),
      perMember,
      albumWinners,
      topPairs,
      favorites,
    });
  });

  // Pairwise agreement between two OG members (the leaderboard's pair dropdown).
  app.get("/api/community/pair-agreement", async (req, res) => {
    const a = Number(req.query.a);
    const b = Number(req.query.b);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) {
      return res.status(400).json({ error: "Provide two distinct member ids (a, b)." });
    }
    const albumInputs = await buildOGAlbumInputs();
    const result = computeOGPairAgreement(a, b, albumInputs);
    res.json(result);
  });

  // ========================================================================
  // ADMIN: member management
  // ========================================================================
  app.get("/api/members", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ error: "Admin required" });
    const list = await storage.listMembers();
    // "Votes" for a member = their actual OG participation: every bracket pick
    // they've made plus every favorite song they've set, across all albums.
    // (The legacy communityVotes table is no longer written to, so counting it
    // always showed 0 — that was the stale total the admin was seeing.)
    const allPicks = await storage.listAllCommunityPicks();
    const allFavorites = await storage.listAllCommunityFavorites();
    res.json(list.map(m => {
      const picks = allPicks.filter(p => p.memberId === m.id).length;
      const favorites = allFavorites.filter(f => f.memberId === m.id).length;
      return {
        ...m,
        // Distinct albums this member has touched (picked in or favorited).
        albumsPlayed: new Set([
          ...allPicks.filter(p => p.memberId === m.id).map(p => p.albumId),
          ...allFavorites.filter(f => f.memberId === m.id).map(f => f.albumId),
        ]).size,
        pickCount: picks,
        favoriteCount: favorites,
        voteCount: picks + favorites,
      };
    }));
  });
  app.post("/api/members/:id/block", async (req, res) => {
    const id = Number(req.params.id);
    const schema = z.object({ blocked: z.boolean() });
    const { blocked } = schema.parse(req.body);
    await storage.setMemberBlocked(id, blocked);
    res.json({ ok: true });
  });

  // Admin: wipe ALL of one member's OG community data (bracket picks +
  // favorites) across every album. The member account is kept so they can
  // start fresh.
  app.post("/api/members/:id/clear-data", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ error: "Admin required" });
    const id = Number(req.params.id);
    const member = await storage.getMember(id);
    if (!member) return res.status(404).json({ error: "Member not found" });
    const removed = await storage.clearCommunityForMember(id);
    res.json({ ok: true, removed });
  });

  // Admin: wipe ALL OG community data for a single album (every member's
  // bracket picks + favorites). The family bracket for the album is untouched.
  app.post("/api/albums/:id/community/clear", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ error: "Admin required" });
    const albumId = Number(req.params.id);
    const album = await storage.getAlbum(albumId);
    if (!album) return res.status(404).json({ error: "Album not found" });
    const removed = await storage.clearCommunityForAlbum(albumId);
    res.json({ ok: true, removed });
  });

  // ========================================================================
  // ADMIN: read-only member bracket viewer
  // Lets the admin inspect exactly what any single member has voted for,
  // album by album, without impersonating them. Mirrors the derivation used
  // by /api/community/my-progress and /api/albums/:id/my-bracket, but keyed
  // off an explicit memberId path param instead of the session.
  // ========================================================================

  // Overview for one member: per-album champion + favorite + pick progress.
  // Powers the top of the admin member-bracket page (album-by-album summary).
  app.get("/api/admin/members/:memberId/overview", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ error: "Admin required" });
    const memberId = Number(req.params.memberId);
    const member = await storage.getMember(memberId);
    if (!member) return res.status(404).json({ error: "Member not found" });

    const albumList = await storage.listAlbums();
    const allPicks = await storage.listCommunityPicksForMemberAll(memberId);
    const allFavs = (await storage.listAllCommunityFavorites()).filter(f => f.memberId === memberId);
    const favByAlbum = new Map<number, string>();
    for (const f of allFavs) favByAlbum.set(f.albumId, f.songTitle);

    const picksByAlbum = new Map<number, typeof allPicks>();
    for (const p of allPicks) {
      const arr = picksByAlbum.get(p.albumId) ?? [];
      arr.push(p);
      picksByAlbum.set(p.albumId, arr);
    }

    let completedAlbums = 0;
    let availableAlbums = 0;
    const albums = albumList.map(a => {
      const tracks = JSON.parse(a.tracks) as string[];
      const total = totalMatchups(a.seedOrder, tracks);
      const available = total > 0;
      if (available) availableAlbums += 1;
      const picks = picksByAlbum.get(a.id) ?? [];
      const seeded = buildRoundOne(a.seedOrder, tracks);
      const bracket = available ? derivePersonalBracket(seeded, picks) : null;
      const made = Math.min(picks.length, total);
      const complete = !!bracket?.complete;
      if (complete) completedAlbums += 1;
      const status = !available
        ? "unavailable"
        : complete
          ? "done"
          : made > 0
            ? "in_progress"
            : "not_started";
      return {
        albumId: a.id,
        title: a.title,
        year: a.year,
        available,
        totalPicks: total,
        madePicks: made,
        complete,
        champion: bracket?.champion ?? null,
        favorite: favByAlbum.get(a.id) ?? null,
        status,
      };
    });

    res.json({
      member: { id: member.id, displayName: member.displayName, email: member.email },
      totalAlbums: albumList.length,
      availableAlbums,
      completedAlbums,
      albums,
    });
  });

  // One member's full personal bracket for a single album (every matchup,
  // round by round, with the song they picked + crowned champion + favorite).
  app.get("/api/admin/members/:memberId/albums/:albumId/bracket", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ error: "Admin required" });
    const memberId = Number(req.params.memberId);
    const albumId = Number(req.params.albumId);
    const member = await storage.getMember(memberId);
    if (!member) return res.status(404).json({ error: "Member not found" });
    const album = await storage.getAlbum(albumId);
    if (!album) return res.status(404).json({ error: "Album not found" });

    const tracks = JSON.parse(album.tracks) as string[];
    const seeded = buildRoundOne(album.seedOrder, tracks);
    if (seeded.roundOne.length === 0) {
      return res.json({ available: false, bracket: null, favorite: null });
    }

    const picks = await storage.listCommunityPicksForMember(albumId, memberId);
    const bracket = derivePersonalBracket(seeded, picks);
    const allFavs = await storage.listAllCommunityFavorites();
    const favorite = allFavs.find(f => f.memberId === memberId && f.albumId === albumId)?.songTitle ?? null;
    res.json({ available: true, bracket, favorite });
  });

  return httpServer;
}

/**
 * Recompute and persist a match's winner based on its votes.
 * Winner is set only when:
 *   - All active players have voted, AND
 *   - There is a clear majority (no tie).
 * Otherwise winner is cleared.
 */
async function recomputeMatchWinner(matchId: number) {
  const m = db.select().from(bracketMatches).where(eq(bracketMatches.id, matchId)).get();
  if (!m) return;
  const players = await storage.listPlayers();
  const votes = db.select().from(matchVotes).where(eq(matchVotes.matchId, matchId)).all();

  const totalPlayers = players.length;
  const totalVotes = votes.length;

  let winner: string | null = null;
  if (totalPlayers > 0 && totalVotes === totalPlayers) {
    const counts: Record<string, number> = {};
    for (const v of votes) counts[v.songVotedFor] = (counts[v.songVotedFor] ?? 0) + 1;
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 1) {
      winner = sorted[0][0];
    } else if (sorted.length >= 2 && sorted[0][1] > sorted[1][1]) {
      winner = sorted[0][0];
    } else {
      winner = null;
    }
  }

  await storage.updateMatchWinner(matchId, winner);
}


