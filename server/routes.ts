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

// Public base URL used to build magic links. Falls back to the request origin.
const APP_BASE_URL = (process.env.APP_BASE_URL || "").replace(/\/$/, "");
const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

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
  "/api/member/logout",
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
    cover_url TEXT
  )`);
  // Add cover_url column to existing album tables (idempotent).
  try {
    const cols = db.all(sql`PRAGMA table_info(albums)`) as Array<{ name: string }>;
    if (!cols.some(c => c.name === "cover_url")) {
      db.run(sql`ALTER TABLE albums ADD COLUMN cover_url TEXT`);
    }
  } catch (e) {
    console.warn("Could not check/add cover_url column:", e);
  }
  db.run(sql`CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#01696F',
    order_index INTEGER NOT NULL DEFAULT 0,
    photo_url TEXT
  )`);
  // Add photo_url column to existing player tables (idempotent).
  try {
    const cols = db.all(sql`PRAGMA table_info(players)`) as Array<{ name: string }>;
    if (!cols.some(c => c.name === "photo_url")) {
      db.run(sql`ALTER TABLE players ADD COLUMN photo_url TEXT`);
    }
  } catch (e) {
    console.warn("Could not check/add photo_url column:", e);
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
    blocked INTEGER NOT NULL DEFAULT 0
  )`);
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

  // --- auth ---
  // Returns whether the current session is admin. Public; used by the client
  // to decide whether to render edit affordances.
  app.get("/api/auth/me", async (req, res) => {
    let member: { id: number; displayName: string; email: string } | null = null;
    if (req.session.memberId) {
      const m = await storage.getMember(req.session.memberId);
      if (m && !m.blocked) {
        member = { id: m.id, displayName: m.displayName, email: m.email };
      } else {
        // Member was deleted or blocked since login — clear stale session.
        req.session.memberId = undefined;
      }
    }
    res.json({
      isAdmin: !!req.session.isAdmin,
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
  app.get("/api/players", async (_req, res) => {
    res.json(await storage.listPlayers());
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

  // --- album status ---
  app.get("/api/album-status", async (_req, res) => {
    res.json(await storage.listAlbumStatuses());
  });
  app.get("/api/albums/:id/status", async (req, res) => {
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

  // --- album results (per-player favorite) ---
  app.get("/api/albums/:id/results", async (req, res) => {
    res.json(await storage.listAlbumResults(Number(req.params.id)));
  });
  app.get("/api/results", async (_req, res) => {
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
  app.get("/api/votes", async (_req, res) => {
    const allVotes = await storage.listAllVotes();
    const allMatches = db.select().from(bracketMatches).all();
    res.json({ matches: allMatches, votes: allVotes });
  });
  // List votes for one album's matches.
  app.get("/api/albums/:id/votes", async (req, res) => {
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
      req.session.save(err => {
        if (err) return res.status(500).json({ error: "Could not start your session." });
        res.json({ member: { id: member.id, displayName: member.displayName, email: member.email } });
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
    res.json({ member: { id: updated.id, displayName: updated.displayName, email: updated.email } });
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
    const counts: Record<string, number> = {};
    for (const f of favs) counts[f.songTitle] = (counts[f.songTitle] ?? 0) + 1;
    const ranked = Object.entries(counts)
      .map(([songTitle, count]) => ({ songTitle, count }))
      .sort((a, b) => b.count - a.count);
    let myFavorite: string | null = null;
    if (req.session.memberId) {
      myFavorite = favs.find(f => f.memberId === req.session.memberId)?.songTitle ?? null;
    }
    res.json({ total: favs.length, ranked, myFavorite });
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
  // ADMIN: member management
  // ========================================================================
  app.get("/api/members", async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ error: "Admin required" });
    const list = await storage.listMembers();
    // Include each member's vote count for context.
    const allVotes = await storage.listAllCommunityVotes();
    res.json(list.map(m => ({
      ...m,
      voteCount: allVotes.filter(v => v.memberId === m.id).length,
    })));
  });
  app.post("/api/members/:id/block", async (req, res) => {
    const id = Number(req.params.id);
    const schema = z.object({ blocked: z.boolean() });
    const { blocked } = schema.parse(req.body);
    await storage.setMemberBlocked(id, blocked);
    res.json({ ok: true });
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


