export interface Album {
  id: number;
  title: string;
  year: number;
  orderIndex: number;
  tracks: string[];
  coverUrl: string | null;
  // JSON-string seed order on the wire is parsed server-side; the client only
  // ever sees the resolved order via the /seeds endpoint.
  seedOrder?: string | null;
}

export interface Player {
  id: number;
  name: string;
  color: string;
  orderIndex: number;
  photoUrl: string | null;
}

export interface Settings {
  currentAlbumId: number | null;
}

export interface AlbumStatus {
  id: number;
  albumId: number;
  status: "not_started" | "in_progress" | "completed";
  winningSong: string | null;
  runnerUpSong: string | null;
  notes: string | null;
  completedAt: string | null;
}

export interface AlbumResult {
  id: number;
  albumId: number;
  playerId: number;
  songTitle: string;
}

export interface BracketMatch {
  id: number;
  albumId: number;
  round: number;
  matchIndex: number;
  songA: string | null;
  songB: string | null;
  winner: string | null;
}

export interface MatchVote {
  id: number;
  matchId: number;
  playerId: number;
  songVotedFor: string;
}

// ----- community -----
export interface MemberInfo {
  id: number;
  displayName: string;
  email: string;
  // Optional uploaded avatar served from /uploads/. Null when none set.
  photoUrl?: string | null;
  // True when the member still has the auto-derived default name (the email
  // prefix) and has never chosen one — used to prompt first-time signers.
  needsName?: boolean;
}

export interface CommunityRoundState {
  albumId: number | null;
  round: number | null;
  isOpen: boolean;
}

export interface CommunityTally {
  matchId: number;
  round: number;
  matchIndex: number;
  songA: string | null;
  songB: string | null;
  aVotes: number;
  bVotes: number;
  total: number;
  leader: string | null;
}

export interface CommunityAlbumData {
  round: CommunityRoundState;
  tallies: CommunityTally[];
  myVotes: Record<number, string>;
}

export interface CommunityFavoritesData {
  total: number;
  ranked: { songTitle: string; count: number }[];
  myFavorite: string | null;
}

export interface AdminMember extends MemberInfo {
  createdAt: string;
  blocked: boolean;
  voteCount: number;
}

// ----- community: per-member personal bracket (new model) -----
export interface PersonalMatch {
  round: number;
  matchIndex: number;
  songA: string | null;
  songB: string | null;
  pick: string | null;
}

export interface PersonalBracket {
  rounds: PersonalMatch[][];
  totalRounds: number;
  complete: boolean;
  champion: string | null;
  // Whether round 1 is a preliminary (play-in) round. When true the main
  // bracket starts at round 2.
  hasPrelims: boolean;
}

export interface MyBracketData {
  available: boolean;
  bracket: PersonalBracket | null;
}

export interface StandingRow {
  songTitle: string;
  points: number;
  votes: number;
  breakdown: { round: number; weight: number; votes: number; points: number }[];
}

export interface CommunityStandings {
  totalRounds: number;
  ranked: StandingRow[];
  winner: string | null;
  voterCount: number;
  // True when round 1 is a preliminary (play-in) round, so the standings
  // breakdown can label round-1 picks "Preliminaries" rather than "Round".
  hasPrelims: boolean;
}

// ----- OG Parrothead Madness leaderboard -----
export interface OGMemberAlbumStat {
  albumId: number;
  champion: string | null;
  communityWinner: string | null;
  championCorrect: boolean;
  completed: boolean;
  rawConsensus: number;
  bestConsensus: number;
  consensusPct: number;
  r1Agree: number;
  r1Total: number;
}

export interface OGMemberStat {
  memberId: number;
  albumsCompleted: number;
  championsCorrect: number;
  championAccuracy: number;
  consensusScore: number;
  albumsPlayed: number;
  r1Agree: number;
  r1Total: number;
  r1Agreement: number;
  perAlbum: OGMemberAlbumStat[];
}

export interface OGAlbumWinner {
  albumId: number;
  winner: string | null;
  voterCount: number;
  totalRounds: number;
}

export interface OGFavorite {
  memberId: number;
  albumId: number;
  songTitle: string;
}

export interface OGTopPair {
  memberA: number;
  memberB: number;
  shared: number;
  agreed: number;
  pct: number;
}

export interface OGLeaderboardData {
  members: { id: number; displayName: string; photoUrl?: string | null }[];
  perMember: OGMemberStat[];
  albumWinners: OGAlbumWinner[];
  topPairs: OGTopPair[];
  favorites: OGFavorite[];
}

export interface OGPairAgreement {
  shared: number;
  agreed: number;
  pct: number;
  sameChampion: boolean | null;
  albumsBothCompleted: number;
  sameChampionCount: number;
}

// ----- community: per-album seeding (admin) -----
export interface AlbumSeeds {
  // Resolved seed order, seed 1 (best) -> seed N, in slot order.
  seedOrder: string[];
  // True when an explicit admin seed order has been saved (vs. track default).
  isCustom: boolean;
  totalRounds: number;
  hasPrelims: boolean;
  prelimGames: number;
  roundOne: { songA: string | null; songB: string | null }[];
}
