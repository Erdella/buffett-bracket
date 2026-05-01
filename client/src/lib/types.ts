export interface Album {
  id: number;
  title: string;
  year: number;
  orderIndex: number;
  tracks: string[];
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
