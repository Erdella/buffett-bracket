import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ---------- Albums ----------
export const albums = sqliteTable("albums", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  year: integer("year").notNull(),
  orderIndex: integer("order_index").notNull(),
  // tracks stored as JSON string array of song titles
  tracks: text("tracks").notNull(),
});

export const insertAlbumSchema = createInsertSchema(albums).omit({ id: true });
export type InsertAlbum = z.infer<typeof insertAlbumSchema>;
export type Album = typeof albums.$inferSelect;

// ---------- Players ----------
export const players = sqliteTable("players", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#01696F"),
  orderIndex: integer("order_index").notNull().default(0),
  // Optional uploaded avatar. URL path served by the app (e.g. /uploads/p3-...png).
  photoUrl: text("photo_url"),
});

export const insertPlayerSchema = createInsertSchema(players).omit({ id: true });
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof players.$inferSelect;

// ---------- Settings ----------
// Single-row table for global app settings (current album, etc.)
export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  currentAlbumId: integer("current_album_id"),
});

// ---------- Album Results ----------
// One row per (album, player) recording that player's favorite song from that album.
// Tracking individual votes lets us show per-person favorites and aggregate winners.
export const albumResults = sqliteTable("album_results", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  albumId: integer("album_id").notNull(),
  playerId: integer("player_id").notNull(),
  songTitle: text("song_title").notNull(),
});

export const insertAlbumResultSchema = createInsertSchema(albumResults).omit({ id: true });
export type InsertAlbumResult = z.infer<typeof insertAlbumResultSchema>;
export type AlbumResult = typeof albumResults.$inferSelect;

// ---------- Album Status ----------
// Tracks status of an album in the competition: not_started | in_progress | completed
// Also stores the family-wide winning song (chosen by bracket) for completed albums.
export const albumStatus = sqliteTable("album_status", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  albumId: integer("album_id").notNull().unique(),
  status: text("status").notNull().default("not_started"), // not_started | in_progress | completed
  winningSong: text("winning_song"),
  runnerUpSong: text("runner_up_song"),
  notes: text("notes"),
  completedAt: text("completed_at"),
});

export const insertAlbumStatusSchema = createInsertSchema(albumStatus).omit({ id: true });
export type InsertAlbumStatus = z.infer<typeof insertAlbumStatusSchema>;
export type AlbumStatus = typeof albumStatus.$inferSelect;

// ---------- Bracket Matches ----------
// Each match in an album's head-to-head bracket. round 1 = first round of pairings.
export const bracketMatches = sqliteTable("bracket_matches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  albumId: integer("album_id").notNull(),
  round: integer("round").notNull(),
  matchIndex: integer("match_index").notNull(), // position within the round (0-based)
  songA: text("song_a"), // song title or null (bye)
  songB: text("song_b"),
  winner: text("winner"), // null until decided
});

export const insertBracketMatchSchema = createInsertSchema(bracketMatches).omit({ id: true });
export type InsertBracketMatch = z.infer<typeof insertBracketMatchSchema>;
export type BracketMatch = typeof bracketMatches.$inferSelect;

// ---------- Votes ----------
// One row per (match, player). Records which song each family member voted for in a head-to-head matchup.
// Winner is derived: when all 5 players have voted, majority decides.
export const matchVotes = sqliteTable("match_votes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  matchId: integer("match_id").notNull(),
  playerId: integer("player_id").notNull(),
  songVotedFor: text("song_voted_for").notNull(),
});

export const insertMatchVoteSchema = createInsertSchema(matchVotes).omit({ id: true });
export type InsertMatchVote = z.infer<typeof insertMatchVoteSchema>;
export type MatchVote = typeof matchVotes.$inferSelect;
