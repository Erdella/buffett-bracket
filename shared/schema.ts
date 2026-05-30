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
  // Optional uploaded album cover (URL path served by the app, e.g. /uploads/album-3-...jpg).
  coverUrl: text("cover_url"),
  // Optional community bracket SEED ORDER: a JSON string array of song titles
  // ranked seed 1 (best) -> seed N. When null/absent, track order is used as
  // the default seeding. The seeded bracket builder uses this to decide which
  // songs get direct entry and which play in the preliminary round.
  seedOrder: text("seed_order"),
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

// ========================================================================
// COMMUNITY LAYER
// ------------------------------------------------------------------------
// The original tables above power the closed 5-person FAMILY bracket.
// The tables below power the public "Parrothead Madness" community tally:
// anyone with a magic link can log in and vote for themselves. Community
// votes are kept entirely separate from the family bracket so the two
// tallies can be shown side by side.
// ========================================================================

// ---------- Members ----------
// A registered community voter. Identity = verified email address.
// displayName is what shows on the leaderboard / vote tallies.
export const members = sqliteTable("members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  createdAt: text("created_at").notNull(),
  // Optional: lets an admin block a member without deleting their votes.
  blocked: integer("blocked", { mode: "boolean" }).notNull().default(false),
  // Optional uploaded avatar. URL path served by the app (e.g. /uploads/m3-...png).
  photoUrl: text("photo_url"),
});

export const insertMemberSchema = createInsertSchema(members).omit({ id: true });
export type InsertMember = z.infer<typeof insertMemberSchema>;
export type Member = typeof members.$inferSelect;

// ---------- Login Tokens (magic links) ----------
// Short-lived single-use tokens emailed to a member. The token string is the
// random secret embedded in the magic link; we look it up on verify.
export const loginTokens = sqliteTable("login_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  token: text("token").notNull().unique(),
  email: text("email").notNull(),
  expiresAt: integer("expires_at").notNull(), // epoch ms
  usedAt: integer("used_at"), // epoch ms, null until consumed
});

export type LoginToken = typeof loginTokens.$inferSelect;

// ---------- Community Round State ----------
// Single-row table describing which bracket match is currently OPEN for
// community voting, and whether voting is open. The admin advances this
// manually (open a round -> members vote -> admin closes & locks winner).
// We point at a specific (albumId, round) so the "current round" maps onto
// the family bracket's match rows for that album+round.
export const communityRound = sqliteTable("community_round", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  albumId: integer("album_id"),
  round: integer("round"),
  isOpen: integer("is_open", { mode: "boolean" }).notNull().default(false),
});

// ---------- Community Match Votes ----------
// One row per (match, member). Records which song a logged-in community
// member voted for in a head-to-head matchup. Winner is the plurality of
// whatever votes were cast (NO requirement that everyone votes).
export const communityVotes = sqliteTable("community_votes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  matchId: integer("match_id").notNull(),
  memberId: integer("member_id").notNull(),
  songVotedFor: text("song_voted_for").notNull(),
});

export type CommunityVote = typeof communityVotes.$inferSelect;

// ---------- Community Album Favorites ----------
// One row per (album, member): that member's single favorite song from the
// album. Independent of the bracket voting above.
export const communityFavorites = sqliteTable("community_favorites", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  albumId: integer("album_id").notNull(),
  memberId: integer("member_id").notNull(),
  songTitle: text("song_title").notNull(),
});

export type CommunityFavorite = typeof communityFavorites.$inferSelect;

// ---------- Community Bracket Picks (per-member personal bracket) ----------
// The NEW community model. Each member runs their OWN copy of the album
// bracket: everyone starts from the same round-1 pairings (identical to the
// family bracket), but each member's chosen winners advance to the next round
// on THEIR personal bracket. So two members can have completely different
// round-2+ matchups. One row per (album, member, round, matchIndex) recording
// the song that member picked to win that matchup.
//
// Album-level results are computed by WEIGHTED points across all members'
// picks: a vote in an early round (prelims/quarters) = 1 pt, a vote in the
// semis (2nd-to-last round) = 2 pts, a vote in the championship (last round)
// = 4 pts. The album's community winner is the song with the most points;
// ties are broken alphabetically.
export const communityBracketPicks = sqliteTable("community_bracket_picks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  albumId: integer("album_id").notNull(),
  memberId: integer("member_id").notNull(),
  round: integer("round").notNull(),
  matchIndex: integer("match_index").notNull(),
  songPicked: text("song_picked").notNull(),
});

export type CommunityBracketPick = typeof communityBracketPicks.$inferSelect;
