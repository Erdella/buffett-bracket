import {
  albums, players, settings, albumResults, albumStatus, bracketMatches, matchVotes,
  members, loginTokens, communityRound, communityVotes, communityFavorites,
} from "@shared/schema";
import type {
  Album, InsertAlbum,
  Player, InsertPlayer,
  AlbumResult, InsertAlbumResult,
  AlbumStatus, InsertAlbumStatus,
  BracketMatch, InsertBracketMatch,
  MatchVote,
  Member, LoginToken, CommunityVote, CommunityFavorite,
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
  updateAlbum(id: number, patch: Partial<InsertAlbum>): Promise<Album | undefined>;
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

  // ----- community -----
  // members
  getMemberByEmail(email: string): Promise<Member | undefined>;
  getMember(id: number): Promise<Member | undefined>;
  listMembers(): Promise<Member[]>;
  upsertMember(email: string, displayName: string): Promise<Member>;
  setMemberBlocked(id: number, blocked: boolean): Promise<void>;
  // login tokens
  createLoginToken(token: string, email: string, expiresAt: number): Promise<void>;
  getLoginToken(token: string): Promise<LoginToken | undefined>;
  consumeLoginToken(token: string): Promise<void>;
  // community round state
  getCommunityRound(): Promise<{ albumId: number | null; round: number | null; isOpen: boolean }>;
  setCommunityRound(albumId: number | null, round: number | null, isOpen: boolean): Promise<void>;
  // community votes
  upsertCommunityVote(matchId: number, memberId: number, songVotedFor: string): Promise<CommunityVote>;
  deleteCommunityVote(matchId: number, memberId: number): Promise<void>;
  listCommunityVotesForAlbum(albumId: number): Promise<CommunityVote[]>;
  listAllCommunityVotes(): Promise<CommunityVote[]>;
  // community favorites
  upsertCommunityFavorite(albumId: number, memberId: number, songTitle: string): Promise<CommunityFavorite>;
  deleteCommunityFavorite(albumId: number, memberId: number): Promise<void>;
  listCommunityFavorites(albumId: number): Promise<CommunityFavorite[]>;
  listAllCommunityFavorites(): Promise<CommunityFavorite[]>;
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
  async updateAlbum(id: number, patch: Partial<InsertAlbum>): Promise<Album | undefined> {
    return db.update(albums).set(patch).where(eq(albums.id, id)).returning().get();
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

  // ===================== COMMUNITY =====================

  // ----- members -----
  async getMemberByEmail(email: string): Promise<Member | undefined> {
    return db.select().from(members).where(eq(members.email, email)).get();
  }
  async getMember(id: number): Promise<Member | undefined> {
    return db.select().from(members).where(eq(members.id, id)).get();
  }
  async listMembers(): Promise<Member[]> {
    return db.select().from(members).orderBy(asc(members.displayName)).all();
  }
  async upsertMember(email: string, displayName: string): Promise<Member> {
    const existing = db.select().from(members).where(eq(members.email, email)).get();
    if (existing) {
      // Update display name only if a non-empty one is provided and it changed.
      if (displayName && displayName !== existing.displayName) {
        return db.update(members).set({ displayName }).where(eq(members.id, existing.id)).returning().get();
      }
      return existing;
    }
    return db.insert(members).values({
      email,
      displayName: displayName || email.split("@")[0],
      createdAt: new Date().toISOString(),
      blocked: false,
    }).returning().get();
  }
  async setMemberBlocked(id: number, blocked: boolean): Promise<void> {
    db.update(members).set({ blocked }).where(eq(members.id, id)).run();
  }

  // ----- login tokens -----
  async createLoginToken(token: string, email: string, expiresAt: number): Promise<void> {
    db.insert(loginTokens).values({ token, email, expiresAt, usedAt: null }).run();
  }
  async getLoginToken(token: string): Promise<LoginToken | undefined> {
    return db.select().from(loginTokens).where(eq(loginTokens.token, token)).get();
  }
  async consumeLoginToken(token: string): Promise<void> {
    db.update(loginTokens).set({ usedAt: Date.now() }).where(eq(loginTokens.token, token)).run();
  }

  // ----- community round state -----
  async getCommunityRound(): Promise<{ albumId: number | null; round: number | null; isOpen: boolean }> {
    const r = db.select().from(communityRound).where(eq(communityRound.id, 1)).get();
    return {
      albumId: r?.albumId ?? null,
      round: r?.round ?? null,
      isOpen: r?.isOpen ?? false,
    };
  }
  async setCommunityRound(albumId: number | null, round: number | null, isOpen: boolean): Promise<void> {
    const existing = db.select().from(communityRound).where(eq(communityRound.id, 1)).get();
    if (existing) {
      db.update(communityRound).set({ albumId, round, isOpen }).where(eq(communityRound.id, 1)).run();
    } else {
      db.insert(communityRound).values({ id: 1, albumId, round, isOpen }).run();
    }
  }

  // ----- community votes -----
  async upsertCommunityVote(matchId: number, memberId: number, songVotedFor: string): Promise<CommunityVote> {
    const existing = db.select().from(communityVotes)
      .where(and(eq(communityVotes.matchId, matchId), eq(communityVotes.memberId, memberId)))
      .get();
    if (existing) {
      return db.update(communityVotes).set({ songVotedFor })
        .where(eq(communityVotes.id, existing.id)).returning().get();
    }
    return db.insert(communityVotes).values({ matchId, memberId, songVotedFor }).returning().get();
  }
  async deleteCommunityVote(matchId: number, memberId: number): Promise<void> {
    db.delete(communityVotes)
      .where(and(eq(communityVotes.matchId, matchId), eq(communityVotes.memberId, memberId)))
      .run();
  }
  async listCommunityVotesForAlbum(albumId: number): Promise<CommunityVote[]> {
    const ms = db.select({ id: bracketMatches.id }).from(bracketMatches)
      .where(eq(bracketMatches.albumId, albumId)).all();
    const ids = ms.map(m => m.id);
    if (ids.length === 0) return [];
    return db.select().from(communityVotes).where(inArray(communityVotes.matchId, ids)).all();
  }
  async listAllCommunityVotes(): Promise<CommunityVote[]> {
    return db.select().from(communityVotes).all();
  }

  // ----- community favorites -----
  async upsertCommunityFavorite(albumId: number, memberId: number, songTitle: string): Promise<CommunityFavorite> {
    const existing = db.select().from(communityFavorites)
      .where(and(eq(communityFavorites.albumId, albumId), eq(communityFavorites.memberId, memberId)))
      .get();
    if (existing) {
      return db.update(communityFavorites).set({ songTitle })
        .where(eq(communityFavorites.id, existing.id)).returning().get();
    }
    return db.insert(communityFavorites).values({ albumId, memberId, songTitle }).returning().get();
  }
  async deleteCommunityFavorite(albumId: number, memberId: number): Promise<void> {
    db.delete(communityFavorites)
      .where(and(eq(communityFavorites.albumId, albumId), eq(communityFavorites.memberId, memberId)))
      .run();
  }
  async listCommunityFavorites(albumId: number): Promise<CommunityFavorite[]> {
    return db.select().from(communityFavorites).where(eq(communityFavorites.albumId, albumId)).all();
  }
  async listAllCommunityFavorites(): Promise<CommunityFavorite[]> {
    return db.select().from(communityFavorites).all();
  }
}

export const storage = new DatabaseStorage();
