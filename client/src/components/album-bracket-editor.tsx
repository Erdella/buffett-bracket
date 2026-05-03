import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Album, BracketMatch, Player, AlbumResult, AlbumStatus, MatchVote } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BracketView } from "@/components/bracket-view";
import { RoundComposer } from "@/components/round-composer";
import { PlayerAvatar } from "@/components/player-avatar";
import { groupByRound, isRoundFullyVoted, winnersOfRound } from "@/lib/bracket";
import { Music, Users, RotateCcw, CheckCircle2, Undo2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

interface Props {
  album: Album;
}

export function AlbumBracketEditor({ album }: Props) {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const albumId = album.id;

  const bracket = useQuery<BracketMatch[]>({ queryKey: ["/api/albums", albumId, "bracket"] });
  const status = useQuery<AlbumStatus | null>({ queryKey: ["/api/albums", albumId, "status"] });
  const players = useQuery<Player[]>({ queryKey: ["/api/players"] });
  const results = useQuery<AlbumResult[]>({ queryKey: ["/api/albums", albumId, "results"] });
  const votes = useQuery<MatchVote[]>({ queryKey: ["/api/albums", albumId, "votes"] });

  const matches = bracket.data ?? [];
  const allVotes = votes.data ?? [];
  const playerList = players.data ?? [];
  const totalPlayers = playerList.length;
  const rounds = groupByRound(matches);
  const latestRound = rounds.length > 0 ? rounds[rounds.length - 1][0] : 0;
  const latestRoundSize = rounds.length > 0 ? rounds[rounds.length - 1][1].length : 0;
  const prevRoundSize = rounds.length > 1 ? rounds[rounds.length - 2][1].length : 0;
  const isComplete = status.data?.status === "completed";
  // Anything that mutates state (voting, composing rounds, marking complete,
  // editing personal favorites) is gated behind admin login.
  const readOnly = isComplete || !isAdmin;

  // Round is "done" only when every match has all votes in AND a winner is set (no ties).
  const latestRoundDone = latestRound > 0 && isRoundFullyVoted(matches, latestRound, totalPlayers);
  // A 1-match round is only the championship Final if it followed a 2-match
  // Semifinal. A 1-match Round 1 (or any 1-match round whose predecessor had
  // more than 2 matches) is a prelim play-in and the bracket should keep
  // advancing — e.g. a 9-song album: Round 1 prelim (1 match) → Round 2
  // Quarterfinals (4 matches) when the prelim winner joins the top 7 seeds.
  const isFinalRound = latestRoundSize === 1 && prevRoundSize === 2;
  const nextRoundAvailable = !isComplete && latestRound > 0 && latestRoundDone && !isFinalRound;
  const canMarkComplete = !isComplete && latestRoundDone && isFinalRound;
  const winnersOfLatest = winnersOfRound(matches, latestRound);

  const castVote = useMutation({
    mutationFn: async ({ matchId, playerId, song }: { matchId: number; playerId: number; song: string | null }) => {
      if (song === null) {
        await apiRequest("DELETE", `/api/match-votes/${matchId}/${playerId}`, undefined);
      } else {
        await apiRequest("POST", `/api/match-votes`, { matchId, playerId, songVotedFor: song });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/albums", albumId, "bracket"] });
      queryClient.invalidateQueries({ queryKey: ["/api/albums", albumId, "votes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/votes"] });
    },
  });

  const deleteRound = useMutation({
    mutationFn: async (round: number) => {
      await apiRequest("DELETE", `/api/albums/${albumId}/bracket/rounds/${round}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/albums", albumId, "bracket"] });
      queryClient.invalidateQueries({ queryKey: ["/api/albums", albumId, "votes"] });
    },
  });

  const clearBracket = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/albums/${albumId}/bracket`, undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/albums", albumId, "bracket"] });
      queryClient.invalidateQueries({ queryKey: ["/api/albums", albumId, "votes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/album-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/albums", albumId, "status"] });
      toast({ title: "Bracket cleared" });
    },
  });

  const markComplete = useMutation({
    mutationFn: async () => {
      const finalMatch = matches.find(m => m.round === latestRound);
      const winner = finalMatch?.winner ?? null;
      const runnerUp = winner ? (finalMatch?.songA === winner ? finalMatch?.songB : finalMatch?.songA) : null;
      await apiRequest("POST", `/api/albums/${albumId}/status`, {
        status: "completed",
        winningSong: winner,
        runnerUpSong: runnerUp ?? null,
        completedAt: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/album-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/albums", albumId, "status"] });
      toast({ title: "Album complete", description: "Saved to the leaderboard." });
    },
  });

  const reopenAlbum = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/albums/${albumId}/status`, {
        status: "in_progress",
        winningSong: null,
        runnerUpSong: null,
        completedAt: null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/album-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/albums", albumId, "status"] });
      toast({ title: "Reopened for edits" });
    },
  });

  return (
    <div className="space-y-6">
      {/* Action bar — admin-only */}
      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          {canMarkComplete && (
            <Button onClick={() => markComplete.mutate()} disabled={markComplete.isPending} data-testid="button-mark-complete">
              <CheckCircle2 className="h-4 w-4 mr-1.5" /> Mark album complete
            </Button>
          )}
          {isComplete && (
            <Button variant="outline" onClick={() => reopenAlbum.mutate()} disabled={reopenAlbum.isPending} data-testid="button-reopen">
              <Undo2 className="h-4 w-4 mr-1.5" /> Reopen for edits
            </Button>
          )}
          {matches.length > 0 && !isComplete && (
            <Button
              variant="ghost"
              onClick={() => { if (confirm("Clear the entire bracket? This removes every round and all votes.")) clearBracket.mutate(); }}
              disabled={clearBracket.isPending}
              data-testid="button-clear-bracket"
            >
              <RotateCcw className="h-4 w-4 mr-1.5" /> Clear bracket
            </Button>
          )}
        </div>
      )}

      {/* The bracket itself, or empty state */}
      {matches.length > 0 ? (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>The Bracket</h2>
            {!readOnly && <span className="text-xs text-muted-foreground">Tap a name to record their vote</span>}
            {!isAdmin && !isComplete && <span className="text-xs text-muted-foreground">Read-only — log in to vote</span>}
          </div>
          <BracketView
            matches={matches}
            votes={allVotes}
            players={playerList}
            onCastVote={(matchId, playerId, song) => castVote.mutate({ matchId, playerId, song })}
            onDeleteRound={(r) => deleteRound.mutate(r)}
            readOnly={readOnly}
          />
        </section>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <Music className="h-7 w-7 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              No bracket yet. Paste this album's Round 1 matchups below to begin.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Round composer — admin-only */}
      {isAdmin && !isComplete && matches.length === 0 && (
        <RoundComposer
          albumId={albumId}
          round={1}
          tracks={album.tracks}
          helperText={`Round 1 — pair every track from "${album.title}".`}
        />
      )}
      {isAdmin && nextRoundAvailable && (
        <RoundComposer
          albumId={albumId}
          round={latestRound + 1}
          tracks={album.tracks}
          helperText={
            latestRoundSize === 2
              ? "Time for the Final."
              : latestRoundSize === 4
                ? "Time for the Semifinals."
                : latestRoundSize === 8
                  ? "Time for the Quarterfinals."
                  : `Round ${latestRound + 1} — pair the ${winnersOfLatest.length} winners from the previous round (or add prelim entries from the album).`
          }
        />
      )}
      {!nextRoundAvailable && !canMarkComplete && matches.length > 0 && !isComplete && (
        <Card className="bg-muted/30 border-dashed">
          <CardContent className="py-4 text-xs text-muted-foreground text-center">
            All {totalPlayers} family members must vote on every Round {latestRound} matchup before the next round unlocks.
          </CardContent>
        </Card>
      )}

      {/* Per-player favorites */}
      {playerList.length > 0 && (
        <PerPlayerPicks
          albumId={albumId}
          tracks={album.tracks}
          players={playerList}
          results={results.data ?? []}
          readOnly={readOnly}
        />
      )}
    </div>
  );
}

function PerPlayerPicks({
  albumId, tracks, players, results, readOnly,
}: {
  albumId: number;
  tracks: string[];
  players: Player[];
  results: AlbumResult[];
  readOnly?: boolean;
}) {
  const setPick = useMutation({
    mutationFn: async ({ playerId, songTitle }: { playerId: number; songTitle: string }) =>
      apiRequest("POST", `/api/albums/${albumId}/results`, { playerId, songTitle }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/albums", albumId, "results"] }),
  });
  const clearPick = useMutation({
    mutationFn: async (playerId: number) =>
      apiRequest("DELETE", `/api/albums/${albumId}/results/${playerId}`, undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/albums", albumId, "results"] }),
  });

  return (
    <section>
      <div className="flex items-center gap-2 mb-1">
        <Users className="h-4 w-4 text-muted-foreground" />
        <h2 className="font-display text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>Personal Favorites</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">Each family member's overall pick from this album (separate from bracket voting).</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {players.map(p => {
          const r = results.find(x => x.playerId === p.id);
          return (
            <Card key={p.id} className="overflow-hidden">
              <CardContent className="p-4 flex items-center gap-3">
                <PlayerAvatar player={p} sizeClass="h-10 w-10" textSizeClass="text-sm" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm" data-testid={`text-player-${p.id}`}>{p.name}</div>
                  {readOnly ? (
                    <div className="text-sm text-muted-foreground mt-0.5 truncate">
                      {r?.songTitle ?? <span className="italic">No pick recorded</span>}
                    </div>
                  ) : (
                    <select
                      className="mt-1 w-full bg-background text-foreground text-sm border border-input rounded-md px-2 py-1.5 hover-elevate active-elevate [&>option]:bg-background [&>option]:text-foreground"
                      style={{ colorScheme: 'light dark' }}
                      value={r?.songTitle ?? ""}
                      data-testid={`select-pick-${p.id}`}
                      onChange={e => {
                        const v = e.target.value;
                        if (!v) clearPick.mutate(p.id);
                        else setPick.mutate({ playerId: p.id, songTitle: v });
                      }}
                    >
                      <option value="">— pick a song —</option>
                      {tracks.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
