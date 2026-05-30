export interface Album {
  id: number;
  title: string;
  year: number;
  orderIndex: number;
  tracks: string[];
  coverUrl: string | null;
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
}
