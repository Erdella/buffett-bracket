import {
  albums, players, settings, albumResults, albumStatus, bracketMatches, matchVotes,
} from "@shared/schema";
import type {
  Album, InsertAlbum,
  Player, InsertPlayer,
  AlbumResult, InsertAlbumResult,
  AlbumStatus, InsertAlbumStatus,
  BracketMatch, InsertBracketMatch,
  MatchVote,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and, asc, inArray } from "drizzle-orm";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

export interface IStorage {
  // albums
  listAlbums(): Promise<Album[]>;
  getAlbum(id: number): Promise<Album | undefined>;
  createAlbum(a: InsertAlbum): Promise<Album>;

  // players
  listPlayers(): Promise<Player[]>;
  createPlayer(p: InsertPlayer): Promise<Player>;
  updatePlayer(id: number, p: Partial<InsertPlayer>): Promise<Player | undefined>;
  deletePlayer(id: number): Promise<void>;

  // settings
  getCurrentAlbumId(): Promise<number | null>;
  setCurrentAlbumId(albumId: number | null): Promise<void>;

  // album status
  listAlbumStatuses(): Promise<AlbumStatus[]>;
  getAlbumStatus(albumId: number): Promise<AlbumStatus | undefined>;
  upsertAlbumStatus(s: InsertAlbumStatus): Promise<AlbumStatus>;

  // album results (per-player favorite picks)
  listAlbumResults(albumId: number): Promise<AlbumResult[]>;
  listAllResults(): Promise<AlbumResult[]>;
  upsertAlbumResult(r: InsertAlbumResult): Promise<AlbumResult>;
  deleteAlbumResult(albumId: number, playerId: number): Promise<void>;

  // bracket
  listBracketMatches(albumId: number): Promise<BracketMatch[]>;
  replaceBracket(albumId: number, matches: InsertBracketMatch[]): Promise<BracketMatch[]>;
  appendBracketRound(albumId: number, round: number, matchups: { songA: string; songB: string }[]): Promise<BracketMatch[]>;
  deleteBracketRound(albumId: number, round: number): Promise<void>;
  updateMatchWinner(matchId: number, winner: string | null): Promise<BracketMatch | undefined>;
  clearBracket(albumId: number): Promise<void>;

  // votes
  listVotesForAlbum(albumId: number): Promise<MatchVote[]>;
  listAllVotes(): Promise<MatchVote[]>;
  upsertVote(matchId: number, playerId: number, songVotedFor: string): Promise<MatchVote>;
  deleteVote(matchId: number, playerId: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // ----- albums -----
  async listAlbums(): Promise<Album[]> {
    return db.select().from(albums).orderBy(asc(albums.orderIndex)).all();
  }
  async getAlbum(id: number): Promise<Album | undefined> {
    return db.select().from(albums).where(eq(albums.id, id)).get();
  }
  async createAlbum(a: InsertAlbum): Promise<Album> {
    return db.insert(albums).values(a).returning().get();
  }

  // ----- players -----
  async listPlayers(): Promise<Player[]> {
    return db.select().from(players).orderBy(asc(players.orderIndex), asc(players.id)).all();
  }
  async createPlayer(p: InsertPlayer): Promise<Player> {
    return db.insert(players).values(p).returning().get();
  }
  async updatePlayer(id: number, p: Partial<InsertPlayer>): Promise<Player | undefined> {
    const updated = db.update(players).set(p).where(eq(players.id, id)).returning().get();
    return updated;
  }
  async deletePlayer(id: number): Promise<void> {
    db.delete(players).where(eq(players.id, id)).run();
    db.delete(albumResults).where(eq(albumResults.playerId, id)).run();
    db.delete(matchVotes).where(eq(matchVotes.playerId, id)).run();
  }

  // ----- settings -----
  async getCurrentAlbumId(): Promise<number | null> {
    const s = db.select().from(settings).where(eq(settings.id, 1)).get();
    return s?.currentAlbumId ?? null;
  }
  async setCurrentAlbumId(albumId: number | null): Promise<void> {
    const existing = db.select().from(settings).where(eq(settings.id, 1)).get();
    if (existing) {
      db.update(settings).set({ currentAlbumId: albumId }).where(eq(settings.id, 1)).run();
    } else {
      db.insert(settings).values({ id: 1, currentAlbumId: albumId }).run();
    }
  }

  // ----- album status -----
  async listAlbumStatuses(): Promise<AlbumStatus[]> {
    return db.select().from(albumStatus).all();
  }
  async getAlbumStatus(albumId: number): Promise<AlbumStatus | undefined> {
    return db.select().from(albumStatus).where(eq(albumStatus.albumId, albumId)).get();
  }
  async upsertAlbumStatus(s: InsertAlbumStatus): Promise<AlbumStatus> {
    const existing = db.select().from(albumStatus).where(eq(albumStatus.albumId, s.albumId)).get();
    if (existing) {
      return db.update(albumStatus).set(s).where(eq(albumStatus.albumId, s.albumId)).returning().get();
    }
    return db.insert(albumStatus).values(s).returning().get();
  }

  // ----- album results -----
  async listAlbumResults(albumId: number): Promise<AlbumResult[]> {
    return db.select().from(albumResults).where(eq(albumResults.albumId, albumId)).all();
  }
  async listAllResults(): Promise<AlbumResult[]> {
    return db.select().from(albumResults).all();
  }
  async upsertAlbumResult(r: InsertAlbumResult): Promise<AlbumResult> {
    const existing = db.select().from(albumResults)
      .where(and(eq(albumResults.albumId, r.albumId), eq(albumResults.playerId, r.playerId)))
      .get();
    if (existing) {
      return db.update(albumResults).set({ songTitle: r.songTitle })
        .where(eq(albumResults.id, existing.id)).returning().get();
    }
    return db.insert(albumResults).values(r).returning().get();
  }
  async deleteAlbumResult(albumId: number, playerId: number): Promise<void> {
    db.delete(albumResults)
      .where(and(eq(albumResults.albumId, albumId), eq(albumResults.playerId, playerId)))
      .run();
  }

  // ----- bracket -----
  async listBracketMatches(albumId: number): Promise<BracketMatch[]> {
    return db.select().from(bracketMatches)
      .where(eq(bracketMatches.albumId, albumId))
      .orderBy(asc(bracketMatches.round), asc(bracketMatches.matchIndex))
      .all();
  }
  async replaceBracket(albumId: number, matches: InsertBracketMatch[]): Promise<BracketMatch[]> {
    db.delete(bracketMatches).where(eq(bracketMatches.albumId, albumId)).run();
    if (matches.length === 0) return [];
    const inserted: BracketMatch[] = [];
    for (const m of matches) {
      inserted.push(db.insert(bracketMatches).values(m).returning().get());
    }
    return inserted;
  }
  async updateMatchWinner(matchId: number, winner: string | null): Promise<BracketMatch | undefined> {
    return db.update(bracketMatches).set({ winner })
      .where(eq(bracketMatches.id, matchId)).returning().get();
  }
  async appendBracketRound(
    albumId: number,
    round: number,
    matchups: { songA: string; songB: string }[],
  ): Promise<BracketMatch[]> {
    // Replace any existing matches for this round (lets users redo a round).
    // Cascade votes first.
    const existing = db.select({ id: bracketMatches.id }).from(bracketMatches)
      .where(and(eq(bracketMatches.albumId, albumId), eq(bracketMatches.round, round)))
      .all();
    const existingIds = existing.map(m => m.id);
    if (existingIds.length > 0) {
      db.delete(matchVotes).where(inArray(matchVotes.matchId, existingIds)).run();
    }
    db.delete(bracketMatches)
      .where(and(eq(bracketMatches.albumId, albumId), eq(bracketMatches.round, round)))
      .run();
    const inserted: BracketMatch[] = [];
    matchups.forEach((mu, idx) => {
      inserted.push(
        db.insert(bracketMatches).values({
          albumId,
          round,
          matchIndex: idx,
          songA: mu.songA,
          songB: mu.songB,
          winner: null,
        }).returning().get(),
      );
    });
    return inserted;
  }
  async deleteBracketRound(albumId: number, round: number): Promise<void> {
    // Cascade votes for matches in this round.
    const ms = db.select({ id: bracketMatches.id }).from(bracketMatches)
      .where(and(eq(bracketMatches.albumId, albumId), eq(bracketMatches.round, round)))
      .all();
    const ids = ms.map(m => m.id);
    if (ids.length > 0) {
      db.delete(matchVotes).where(inArray(matchVotes.matchId, ids)).run();
    }
    db.delete(bracketMatches)
      .where(and(eq(bracketMatches.albumId, albumId), eq(bracketMatches.round, round)))
      .run();
  }
  async clearBracket(albumId: number): Promise<void> {
    // Cascade: delete votes for matches in this album, then matches.
    const ms = db.select({ id: bracketMatches.id }).from(bracketMatches)
      .where(eq(bracketMatches.albumId, albumId)).all();
    const ids = ms.map(m => m.id);
    if (ids.length > 0) {
      db.delete(matchVotes).where(inArray(matchVotes.matchId, ids)).run();
    }
    db.delete(bracketMatches).where(eq(bracketMatches.albumId, albumId)).run();
  }

  // ----- votes -----
  async listVotesForAlbum(albumId: number): Promise<MatchVote[]> {
    const ms = db.select({ id: bracketMatches.id }).from(bracketMatches)
      .where(eq(bracketMatches.albumId, albumId)).all();
    const ids = ms.map(m => m.id);
    if (ids.length === 0) return [];
    return db.select().from(matchVotes).where(inArray(matchVotes.matchId, ids)).all();
  }
  async listAllVotes(): Promise<MatchVote[]> {
    return db.select().from(matchVotes).all();
  }
  async upsertVote(matchId: number, playerId: number, songVotedFor: string): Promise<MatchVote> {
    const existing = db.select().from(matchVotes)
      .where(and(eq(matchVotes.matchId, matchId), eq(matchVotes.playerId, playerId)))
      .get();
    if (existing) {
      return db.update(matchVotes).set({ songVotedFor })
        .where(eq(matchVotes.id, existing.id)).returning().get();
    }
    return db.insert(matchVotes).values({ matchId, playerId, songVotedFor }).returning().get();
  }
  async deleteVote(matchId: number, playerId: number): Promise<void> {
    db.delete(matchVotes)
      .where(and(eq(matchVotes.matchId, matchId), eq(matchVotes.playerId, playerId)))
      .run();
  }
}

export const storage = new DatabaseStorage();
