import { useQuery } from "@tanstack/react-query";
import type { Album, AlbumResult, AlbumStatus, BracketMatch, MatchVote, Player } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy, Heart, Target, Star } from "lucide-react";
import { Link } from "wouter";
import { PlayerAvatar } from "@/components/player-avatar";
import { AlbumCover } from "@/components/album-cover";

interface VotesPayload {
  matches: BracketMatch[];
  votes: MatchVote[];
}

export default function Leaderboard() {
  const albums = useQuery<Album[]>({ queryKey: ["/api/albums"] });
  const players = useQuery<Player[]>({ queryKey: ["/api/players"] });
  const allResults = useQuery<AlbumResult[]>({ queryKey: ["/api/results"] });
  const statuses = useQuery<AlbumStatus[]>({ queryKey: ["/api/album-status"] });
  const votesPayload = useQuery<VotesPayload>({ queryKey: ["/api/votes"] });

  if (
    !albums.data ||
    !players.data ||
    !allResults.data ||
    !statuses.data ||
    !votesPayload.data
  ) {
    return <div className="text-sm text-muted-foreground">Loading...</div>;
  }

  const albumById = new Map(albums.data.map(a => [a.id, a]));
  const matches = votesPayload.data.matches;
  const votes = votesPayload.data.votes;
  const matchById = new Map(matches.map(m => [m.id, m]));
  const completedAlbums = statuses.data.filter(s => s.status === "completed");

  // ----- Voting accuracy: for each player, count votes that matched the match winner
  const votingStats = players.data.map(p => {
    const myVotes = votes.filter(v => v.playerId === p.id);
    let correct = 0;
    let decided = 0;
    for (const v of myVotes) {
      const m = matchById.get(v.matchId);
      if (!m || !m.winner) continue;
      decided++;
      if (m.winner === v.songVotedFor) correct++;
    }
    const accuracy = decided > 0 ? correct / decided : 0;
    // Personal favorite picks alignment
    const myPicks = allResults.data!.filter(r => r.playerId === p.id);
    let personalAligned = 0;
    for (const pick of myPicks) {
      const status = statuses.data!.find(s => s.albumId === pick.albumId);
      if (status?.status === "completed" && status.winningSong === pick.songTitle) {
        personalAligned++;
      }
    }
    return {
      player: p,
      voteCount: myVotes.length,
      correct,
      decided,
      accuracy,
      personalPicks: myPicks.length,
      personalAligned,
    };
  }).sort((a, b) => b.accuracy - a.accuracy || b.correct - a.correct);

  // ----- Per-player accuracy broken down by album.
  // For every album the player voted on, count how many of their votes matched
  // the eventual match winner. Albums with no decided matches (no votes yet)
  // are skipped.
  type AlbumAccuracyRow = { album: Album; correct: number; decided: number };
  const accuracyByPlayer = new Map<number, AlbumAccuracyRow[]>();
  for (const p of players.data) {
    const myVotes = votes.filter(v => v.playerId === p.id);
    // Bucket the player's votes by album id (via match → album).
    const byAlbum = new Map<number, { correct: number; decided: number }>();
    for (const v of myVotes) {
      const m = matchById.get(v.matchId);
      if (!m || !m.winner) continue;
      const bucket = byAlbum.get(m.albumId) ?? { correct: 0, decided: 0 };
      bucket.decided++;
      if (m.winner === v.songVotedFor) bucket.correct++;
      byAlbum.set(m.albumId, bucket);
    }
    const rows: AlbumAccuracyRow[] = [];
    for (const [albumId, b] of Array.from(byAlbum.entries())) {
      const album = albumById.get(albumId);
      if (!album) continue;
      rows.push({ album, correct: b.correct, decided: b.decided });
    }
    rows.sort((a, b) => a.album.orderIndex - b.album.orderIndex);
    accuracyByPlayer.set(p.id, rows);
  }

  // ----- Agreement matrix: for each pair of players, % of shared matches where they voted for the same song
  const agreementMatrix: { a: Player; b: Player; shared: number; agreed: number; pct: number }[] = [];
  for (let i = 0; i < players.data.length; i++) {
    for (let j = i + 1; j < players.data.length; j++) {
      const pa = players.data[i];
      const pb = players.data[j];
      const aVotes = new Map(votes.filter(v => v.playerId === pa.id).map(v => [v.matchId, v.songVotedFor]));
      const bVotes = new Map(votes.filter(v => v.playerId === pb.id).map(v => [v.matchId, v.songVotedFor]));
      let shared = 0;
      let agreed = 0;
      for (const [matchId, songA] of Array.from(aVotes.entries())) {
        const songB = bVotes.get(matchId);
        if (!songB) continue;
        shared++;
        if (songA === songB) agreed++;
      }
      const pct = shared > 0 ? agreed / shared : 0;
      agreementMatrix.push({ a: pa, b: pb, shared, agreed, pct });
    }
  }
  agreementMatrix.sort((a, b) => b.pct - a.pct);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold" style={{ fontFamily: "var(--font-display)" }}>Leaderboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Whose taste matches the family?</p>
      </div>

      {/* Voting accuracy standings */}
      <section>
        <h2 className="font-display text-xl font-bold mb-3 flex items-center gap-2" style={{ fontFamily: "var(--font-display)" }}>
          <Target className="h-5 w-5 text-primary" /> Voting Accuracy
        </h2>
        <p className="text-xs text-muted-foreground mb-3">% of votes that matched the family winner.</p>
        <Card>
          <CardContent className="p-0 divide-y divide-border/60">
            {votingStats.map(({ player, voteCount, correct, decided, accuracy }, i) => (
              <div key={player.id} className="px-4 py-3 sm:py-4 flex items-center gap-3 sm:gap-4" data-testid={`row-leaderboard-${player.id}`}>
                <div className="font-display text-2xl font-bold w-7 text-center text-muted-foreground" style={{ fontFamily: "var(--font-display)" }}>
                  {i + 1}
                </div>
                <PlayerAvatar player={player} sizeClass="h-10 w-10" textSizeClass="text-base" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">{player.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {voteCount} {voteCount === 1 ? "vote" : "votes"} • {correct}/{decided} matched winner
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-display text-lg font-bold tabular-nums" style={{ fontFamily: "var(--font-display)" }}>
                    {decided === 0 ? "—" : `${Math.round(accuracy * 100)}%`}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">accuracy</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      {/* Per-player Album Accuracy: how each player did on each album's bracket */}
      <section>
        <h2 className="font-display text-xl font-bold mb-3 flex items-center gap-2" style={{ fontFamily: "var(--font-display)" }}>
          <Star className="h-5 w-5 text-primary" /> Album Accuracy
        </h2>
        <p className="text-xs text-muted-foreground mb-3">How each player voted album-by-album — picks that matched the family winner.</p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {players.data.map(p => {
            const rows = accuracyByPlayer.get(p.id) ?? [];
            const totalCorrect = rows.reduce((s, r) => s + r.correct, 0);
            const totalDecided = rows.reduce((s, r) => s + r.decided, 0);
            const overall = totalDecided > 0 ? totalCorrect / totalDecided : 0;
            return (
              <Card key={p.id} data-testid={`card-accuracy-${p.id}`}>
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <PlayerAvatar player={p} sizeClass="h-9 w-9" textSizeClass="text-sm" />
                    <div className="font-display text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>{p.name}</div>
                    <div className="ml-auto text-right">
                      <div className="font-display text-base font-bold tabular-nums" style={{ fontFamily: "var(--font-display)" }}>
                        {totalDecided === 0 ? "—" : `${totalCorrect}/${totalDecided}`}
                      </div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {totalDecided === 0 ? "no votes" : `${Math.round(overall * 100)}% overall`}
                      </div>
                    </div>
                  </div>
                  {rows.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic">No votes yet — jump in once a round is decided.</div>
                  ) : (
                    <ul className="space-y-1.5">
                      {rows.map(({ album, correct, decided }) => {
                        const pct = decided > 0 ? correct / decided : 0;
                        return (
                          <li key={album.id} className="text-sm flex items-baseline gap-2">
                            <span className="text-xs font-mono text-muted-foreground w-12 shrink-0">{album.year}</span>
                            <span className="font-medium truncate flex-1">{album.title}</span>
                            <span className="text-xs font-mono text-muted-foreground shrink-0 tabular-nums">{correct}/{decided}</span>
                            <span className="text-xs font-semibold text-primary shrink-0 tabular-nums w-10 text-right">{Math.round(pct * 100)}%</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Family album winners */}
      <section>
        <h2 className="font-display text-xl font-bold mb-3 flex items-center gap-2" style={{ fontFamily: "var(--font-display)" }}>
          <Trophy className="h-5 w-5 text-primary" /> Family Album Winners
        </h2>
        {completedAlbums.length === 0 ? (
          <div className="text-sm text-muted-foreground italic">No winners yet — finish a bracket to see this fill up.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {completedAlbums
              .slice()
              .sort((a, b) => {
                const aa = albumById.get(a.albumId);
                const bb = albumById.get(b.albumId);
                return (aa?.orderIndex ?? 0) - (bb?.orderIndex ?? 0);
              })
              .map(s => {
                const a = albumById.get(s.albumId);
                if (!a || !s.winningSong) return null;
                return (
                  <Link key={s.id} href={`/albums/${a.id}`} className="block">
                    <Card className="hover-elevate active-elevate">
                      <CardContent className="p-4 flex items-center gap-3">
                        <AlbumCover album={a} sizeClass="h-12 w-12" roundedClass="rounded-md" />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm truncate">{s.winningSong}</div>
                          <div className="text-xs text-muted-foreground truncate">{a.title} • {a.year}</div>
                        </div>
                        <div className="h-9 w-9 rounded-md sun-gradient flex items-center justify-center shrink-0" aria-hidden="true">
                          <Trophy className="h-4 w-4 text-white" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
          </div>
        )}
      </section>

      {/* Agreement matrix */}
      {agreementMatrix.some(p => p.shared > 0) && (
        <section>
          <h2 className="font-display text-xl font-bold mb-3" style={{ fontFamily: "var(--font-display)" }}>Voting Agreement</h2>
          <p className="text-xs text-muted-foreground mb-3">How often each pair voted for the same song.</p>
          <Card>
            <CardContent className="p-0 divide-y divide-border/60">
              {agreementMatrix.map(({ a, b, shared, agreed, pct }) => (
                <div key={`${a.id}-${b.id}`} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <PlayerAvatar player={a} sizeClass="h-7 w-7" />
                    <span className="text-sm font-medium truncate">{a.name}</span>
                    <span className="text-xs text-muted-foreground">+</span>
                    <PlayerAvatar player={b} sizeClass="h-7 w-7" />
                    <span className="text-sm font-medium truncate">{b.name}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-display text-base font-bold tabular-nums" style={{ fontFamily: "var(--font-display)" }}>
                      {shared === 0 ? "—" : `${Math.round(pct * 100)}%`}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{agreed}/{shared}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}

      {/* Personal favorites by player */}
      <section>
        <h2 className="font-display text-xl font-bold mb-3 flex items-center gap-2" style={{ fontFamily: "var(--font-display)" }}>
          <Heart className="h-5 w-5 text-muted-foreground" /> Personal Favorites
        </h2>
        <p className="text-xs text-muted-foreground mb-3">Each player's favorite track from each album (separate from bracket voting).</p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {players.data.map(p => {
            const myPicks = allResults.data!
              .filter(r => r.playerId === p.id)
              .map(r => ({ result: r, album: albumById.get(r.albumId) }))
              .filter(x => !!x.album)
              .sort((a, b) => (a.album!.orderIndex - b.album!.orderIndex));
            return (
              <Card key={p.id}>
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <PlayerAvatar player={p} sizeClass="h-9 w-9" textSizeClass="text-sm" />
                    <div className="font-display text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>{p.name}</div>
                    <div className="ml-auto text-xs text-muted-foreground">{myPicks.length} picks</div>
                  </div>
                  {myPicks.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic">No picks recorded yet.</div>
                  ) : (
                    <ul className="space-y-1.5">
                      {myPicks.map(({ result, album }) => (
                        <li key={result.id} className="text-sm flex items-baseline gap-2">
                          <span className="text-xs font-mono text-muted-foreground w-12 shrink-0">{album!.year}</span>
                          <span className="font-medium truncate flex-1">{result.songTitle}</span>
                          <span className="text-xs text-muted-foreground truncate hidden sm:inline">{album!.title}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
