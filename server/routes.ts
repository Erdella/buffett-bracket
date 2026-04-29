import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "node:http";
import { storage, db } from "./storage";
import {
  insertPlayerSchema, insertAlbumStatusSchema,
  bracketMatches, matchVotes,
} from "@shared/schema";
import { sql, eq } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";
import seedAlbums from "./seed-albums";

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

// Guard middleware: rejects mutating requests (POST/PATCH/PUT/DELETE) on /api/*
// unless the session is flagged as admin. Read endpoints stay public.
function requireAdminForMutations(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith("/api")) return next();
  const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
  if (!isMutation) return next();
  // Auth endpoints themselves are exempt so login can happen.
  if (req.path === "/api/auth/login" || req.path === "/api/auth/logout") return next();
  if (req.session.isAdmin) return next();
  return res.status(401).json({ error: "Admin login required" });
}

async function ensureSchemaAndSeed() {
  // Create tables if they don't exist (Drizzle better-sqlite3 doesn't auto-migrate).
  db.run(sql`CREATE TABLE IF NOT EXISTS albums (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    year INTEGER NOT NULL,
    order_index INTEGER NOT NULL,
    tracks TEXT NOT NULL
  )`);
  db.run(sql`CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#01696F',
    order_index INTEGER NOT NULL DEFAULT 0
  )`);
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

  // Block mutations site-wide unless logged in as admin.
  app.use(requireAdminForMutations);

  // --- auth ---
  // Returns whether the current session is admin. Public; used by the client
  // to decide whether to render edit affordances.
  app.get("/api/auth/me", (req, res) => {
    res.json({
      isAdmin: !!req.session.isAdmin,
      authConfigured: !!ADMIN_PASSWORD_HASH,
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


