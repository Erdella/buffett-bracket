import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, assetUrl } from "@/lib/queryClient";
import type {
  Album, AlbumResult, AlbumStatus, BracketMatch, MatchVote, Player,
  OGLeaderboardData, OGMemberStat, OGPairAgreement, OGTopPair,
} from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Trophy, Heart, Target, Star, ThumbsDown, Sparkles, Users, Crown, Gauge, Handshake } from "lucide-react";
import { Link } from "wouter";
import { PlayerAvatar } from "@/components/player-avatar";
import { MemberAvatar } from "@/components/member-avatar";
import { AlbumCover } from "@/components/album-cover";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

interface VotesPayload {
  matches: BracketMatch[];
  votes: MatchVote[];
}

type View = "family" | "og";

export default function Leaderboard() {
  const { isFamily } = useAuth();
  // Outsiders only ever see the OG leaderboard — no family toggle, no family
  // default. Family/admin default to the family view but can toggle to OG.
  const [view, setView] = useState<View>("family");
  const effectiveView: View = isFamily ? view : "og";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold" style={{ fontFamily: "var(--font-display)" }}>Leaderboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {effectiveView === "family" ? "Whose taste matches the family?" : "How The Original Parrothead Madness crowd stacks up."}
        </p>
      </div>

      {/* View toggle — family/admin only. */}
      {isFamily && (
        <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1" role="tablist" aria-label="Leaderboard view">
          <button
            type="button"
            role="tab"
            aria-selected={view === "family"}
            data-testid="toggle-family"
            onClick={() => setView("family")}
            className={cn(
              "px-4 py-1.5 text-sm font-semibold rounded-md transition-colors",
              view === "family" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover-elevate",
            )}
          >
            Family
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "og"}
            data-testid="toggle-og"
            onClick={() => setView("og")}
            className={cn(
              "px-4 py-1.5 text-sm font-semibold rounded-md transition-colors",
              view === "og" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover-elevate",
            )}
          >
            The Original Parrothead Madness!
          </button>
        </div>
      )}

      {effectiveView === "family" ? <FamilyView /> : <OGView />}
    </div>
  );
}

// Section header used across both views.
function SectionHeader({ icon: Icon, title, hint, destructive }: { icon: any; title: string; hint?: string; destructive?: boolean }) {
  return (
    <>
      <h2 className="font-display text-xl font-bold mb-1 flex items-center gap-2" style={{ fontFamily: "var(--font-display)" }}>
        <Icon className={cn("h-5 w-5", destructive ? "text-destructive" : "text-primary")} /> {title}
      </h2>
      {hint && <p className="text-xs text-muted-foreground mb-3">{hint}</p>}
    </>
  );
}


const pctStr = (x: number) => `${Math.round(x * 100)}%`;

// ============================================================================
// FAMILY VIEW (original leaderboard, unchanged logic)
// ============================================================================
function FamilyView() {
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

  // ----- Voting accuracy
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
    return { player: p, voteCount: myVotes.length, correct, decided, accuracy };
  }).sort((a, b) => b.accuracy - a.accuracy || b.correct - a.correct);

  // ----- Per-player accuracy by album
  type AlbumAccuracyRow = { album: Album; correct: number; decided: number };
  const accuracyByPlayer = new Map<number, AlbumAccuracyRow[]>();
  for (const p of players.data) {
    const myVotes = votes.filter(v => v.playerId === p.id);
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

  // ----- Lost Shakers (3 lowest)
  type AccuracyEntry = { player: Player; album: Album; correct: number; decided: number; pct: number };
  const allEntries: AccuracyEntry[] = [];
  for (const p of players.data) {
    for (const r of accuracyByPlayer.get(p.id) ?? []) {
      if (r.decided <= 0) continue;
      allEntries.push({ player: p, album: r.album, correct: r.correct, decided: r.decided, pct: r.correct / r.decided });
    }
  }
  const lostShakers = allEntries.slice().sort((a, b) => a.pct - b.pct || a.correct - b.correct).slice(0, 3);

  // ----- Jolly Mon
  type JollyMonEntry = { player: Player; perfectAlbums: Album[] };
  const jollyMonGallery: JollyMonEntry[] = players.data.map(p => {
    const perfectAlbums = (accuracyByPlayer.get(p.id) ?? [])
      .filter(r => r.decided > 0 && r.correct === r.decided)
      .map(r => r.album)
      .sort((a, b) => a.orderIndex - b.orderIndex);
    return { player: p, perfectAlbums };
  });

  // ----- Agreement matrix
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
      agreementMatrix.push({ a: pa, b: pb, shared, agreed, pct: shared > 0 ? agreed / shared : 0 });
    }
  }
  agreementMatrix.sort((a, b) => b.pct - a.pct);

  return (
    <>
      {/* Voting accuracy */}
      <section>
        <SectionHeader icon={Target} title="Voting Accuracy" hint="% of votes that matched the family winner." />
        <Card>
          <CardContent className="p-0 divide-y divide-border/60">
            {votingStats.map(({ player, voteCount, correct, decided, accuracy }, i) => (
              <div key={player.id} className="px-4 py-3 sm:py-4 flex items-center gap-3 sm:gap-4" data-testid={`row-leaderboard-${player.id}`}>
                <div className="font-display text-2xl font-bold w-7 text-center text-muted-foreground" style={{ fontFamily: "var(--font-display)" }}>{i + 1}</div>
                <PlayerAvatar player={player} sizeClass="h-10 w-10" textSizeClass="text-base" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">{player.name}</div>
                  <div className="text-xs text-muted-foreground">{voteCount} {voteCount === 1 ? "vote" : "votes"} • {correct}/{decided} matched winner</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-display text-lg font-bold tabular-nums" style={{ fontFamily: "var(--font-display)" }}>{decided === 0 ? "—" : pctStr(accuracy)}</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">accuracy</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      {/* Album accuracy grid */}
      <section>
        <SectionHeader icon={Star} title="Album Accuracy" hint="How each player voted album-by-album — picks that matched the family winner." />
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
                      <div className="font-display text-base font-bold tabular-nums" style={{ fontFamily: "var(--font-display)" }}>{totalDecided === 0 ? "—" : `${totalCorrect}/${totalDecided}`}</div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{totalDecided === 0 ? "no votes" : `${pctStr(overall)} overall`}</div>
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
                            <span className="text-xs font-semibold text-primary shrink-0 tabular-nums w-10 text-right">{pctStr(pct)}</span>
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

      {/* Jolly Mon */}
      <section data-testid="section-jolly-mon">
        <SectionHeader icon={Sparkles} title="The Jolly Mon Gallery" hint="Albums each player called perfectly — every pick matched the family winner." />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {jollyMonGallery.map(({ player, perfectAlbums }) => (
            <Card key={player.id} data-testid={`jolly-mon-${player.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <PlayerAvatar player={player} sizeClass="h-9 w-9" textSizeClass="text-sm" />
                  <div className="font-display text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>{player.name}</div>
                  {perfectAlbums.length > 0 && (
                    <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground tabular-nums">{perfectAlbums.length} perfect</span>
                  )}
                </div>
                {perfectAlbums.length === 0 ? (
                  <div className="text-sm text-muted-foreground italic">“I’m just too original.”</div>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {perfectAlbums.map(album => (
                      <Link key={album.id} href={`/albums/${album.id}`} className="flex items-center gap-2 hover-elevate active-elevate rounded-md p-1 pr-2" data-testid={`jolly-mon-album-${player.id}-${album.id}`}>
                        <AlbumCover album={album} sizeClass="h-12 w-12" roundedClass="rounded-md" />
                        <div className="min-w-0">
                          <div className="text-[11px] font-mono text-muted-foreground leading-none">{album.year}</div>
                          <div className="text-xs font-semibold leading-tight mt-0.5 line-clamp-2 max-w-[10rem]">{album.title}</div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Lost Shakers */}
      {lostShakers.length > 0 && (
        <section data-testid="section-lost-shakers">
          <SectionHeader icon={ThumbsDown} title="The Lost Shakers of Salt" hint="The three lowest album-accuracy showings. No shade — just keeping score." destructive />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {lostShakers.map((entry, i) => (
              <Link key={`${entry.player.id}-${entry.album.id}`} href={`/albums/${entry.album.id}`} className="block" data-testid={`lost-shaker-${i + 1}`}>
                <Card className="hover-elevate active-elevate h-full border-destructive/30">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="font-display text-2xl font-bold w-7 text-center text-destructive shrink-0" style={{ fontFamily: "var(--font-display)" }}>{i + 1}</div>
                      <PlayerAvatar player={entry.player} sizeClass="h-10 w-10" textSizeClass="text-base" />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-sm truncate">{entry.player.name}</div>
                        <div className="text-xs text-muted-foreground truncate"><span className="font-mono">{entry.album.year}</span> · {entry.album.title}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-display text-lg font-bold tabular-nums text-destructive" style={{ fontFamily: "var(--font-display)" }}>{pctStr(entry.pct)}</div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground tabular-nums">{entry.correct}/{entry.decided}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Family album winners */}
      <section>
        <SectionHeader icon={Trophy} title="Family Album Winners" />
        {completedAlbums.length === 0 ? (
          <div className="text-sm text-muted-foreground italic">No winners yet — finish a bracket to see this fill up.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {completedAlbums.slice().sort((a, b) => {
              const aa = albumById.get(a.albumId);
              const bb = albumById.get(b.albumId);
              return (aa?.orderIndex ?? 0) - (bb?.orderIndex ?? 0);
            }).map(s => {
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

      {/* Agreement */}
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
                    <div className="font-display text-base font-bold tabular-nums" style={{ fontFamily: "var(--font-display)" }}>{shared === 0 ? "—" : pctStr(pct)}</div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{agreed}/{shared}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}

      {/* Personal favorites */}
      <section>
        <SectionHeader icon={Heart} title="Personal Favorites" hint="Each player's favorite track from each album (separate from bracket voting)." />
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
    </>
  );
}

// ============================================================================
// OG PARROTHEAD MADNESS VIEW
// ============================================================================
function OGView() {
  const albums = useQuery<Album[]>({ queryKey: ["/api/albums"] });
  const og = useQuery<OGLeaderboardData>({ queryKey: ["/api/community/leaderboard"] });

  const [accuracyMemberId, setAccuracyMemberId] = useState<string>("");
  const [favMemberId, setFavMemberId] = useState<string>("");
  const [pairA, setPairA] = useState<string>("");
  const [pairB, setPairB] = useState<string>("");

  const pairAgreement = useQuery<OGPairAgreement>({
    queryKey: ["/api/community/pair-agreement", pairA, pairB],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/community/pair-agreement?a=${pairA}&b=${pairB}`,
      );
      return res.json();
    },
    enabled: !!pairA && !!pairB && pairA !== pairB,
  });

  if (!albums.data || !og.data) {
    return <div className="text-sm text-muted-foreground">Loading...</div>;
  }

  const albumById = new Map(albums.data.map(a => [a.id, a]));
  const { members, perMember, albumWinners, topPairs, favorites } = og.data;
  const memberById = new Map(members.map(m => [m.id, m]));
  const statById = new Map(perMember.map(s => [s.memberId, s]));
  const nameOf = (id: number) => memberById.get(id)?.displayName ?? "Unknown";
  const photoOf = (id: number) => memberById.get(id)?.photoUrl ?? null;

  if (members.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground italic">
          No Original Parrothead Madness members have joined yet. Once people sign in and fill out brackets, their stats appear here.
        </CardContent>
      </Card>
    );
  }

  // Members who have actually played (made at least one pick).
  const playedStats = perMember.filter(s => s.albumsPlayed > 0);

  // Champion accuracy ranking (only members with completed albums).
  const championRanked = perMember
    .filter(s => s.albumsCompleted > 0)
    .slice()
    .sort((a, b) => b.championAccuracy - a.championAccuracy || b.championsCorrect - a.championsCorrect);

  // Consensus score ranking.
  const consensusRanked = playedStats.slice().sort((a, b) => b.consensusScore - a.consensusScore);
  const topConsensus = consensusRanked.slice(0, 5);
  const bottomConsensus = consensusRanked.slice().reverse().slice(0, 5);

  // Round-1 agreement ranking.
  const r1Ranked = perMember
    .filter(s => s.r1Total > 0)
    .slice()
    .sort((a, b) => b.r1Agreement - a.r1Agreement || b.r1Agree - a.r1Agree);

  // OG album winners, in album order.
  const ogWinners = albumWinners
    .filter(w => w.winner)
    .map(w => ({ ...w, album: albumById.get(w.albumId) }))
    .filter(w => !!w.album)
    .sort((a, b) => a.album!.orderIndex - b.album!.orderIndex);

  // Favorites for the selected member.
  const favsForMember = favMemberId
    ? favorites
        .filter(f => f.memberId === Number(favMemberId))
        .map(f => ({ fav: f, album: albumById.get(f.albumId) }))
        .filter(x => !!x.album)
        .sort((a, b) => a.album!.orderIndex - b.album!.orderIndex)
    : [];

  const selectedAccuracy: OGMemberStat | undefined = accuracyMemberId ? statById.get(Number(accuracyMemberId)) : undefined;

  return (
    <>
      {/* Champion Accuracy */}
      <section>
        <SectionHeader icon={Crown} title="Champion Accuracy" hint="Of the albums you finished, how often your crowned champion matched the community winner." />
        {championRanked.length === 0 ? (
          <div className="text-sm text-muted-foreground italic">No finished brackets yet — pick a champion to land on the board.</div>
        ) : (
          <Card>
            <CardContent className="p-0 divide-y divide-border/60">
              {championRanked.map((s, i) => (
                <div key={s.memberId} className="px-4 py-3 sm:py-4 flex items-center gap-3 sm:gap-4" data-testid={`og-champ-${s.memberId}`}>
                  <div className="font-display text-2xl font-bold w-7 text-center text-muted-foreground" style={{ fontFamily: "var(--font-display)" }}>{i + 1}</div>
                  <MemberAvatar id={s.memberId} name={nameOf(s.memberId)} photoUrl={photoOf(s.memberId)} sizeClass="h-10 w-10" textSizeClass="text-base" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{nameOf(s.memberId)}</div>
                    <div className="text-xs text-muted-foreground">{s.championsCorrect}/{s.albumsCompleted} albums called</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-display text-lg font-bold tabular-nums" style={{ fontFamily: "var(--font-display)" }}>{pctStr(s.championAccuracy)}</div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">accuracy</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      {/* Consensus Score */}
      <section>
        <SectionHeader icon={Gauge} title="Consensus Score" hint="How strongly each member backed the songs the crowd backed — 100% means most aligned with the community." />
        {consensusRanked.length === 0 ? (
          <div className="text-sm text-muted-foreground italic">No picks yet.</div>
        ) : (
          <Card>
            <CardContent className="p-0 divide-y divide-border/60">
              {consensusRanked.map((s, i) => (
                <div key={s.memberId} className="px-4 py-3 sm:py-4 flex items-center gap-3 sm:gap-4" data-testid={`og-consensus-${s.memberId}`}>
                  <div className="font-display text-2xl font-bold w-7 text-center text-muted-foreground" style={{ fontFamily: "var(--font-display)" }}>{i + 1}</div>
                  <MemberAvatar id={s.memberId} name={nameOf(s.memberId)} photoUrl={photoOf(s.memberId)} sizeClass="h-10 w-10" textSizeClass="text-base" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{nameOf(s.memberId)}</div>
                    <div className="text-xs text-muted-foreground">{s.albumsPlayed} {s.albumsPlayed === 1 ? "album" : "albums"} played</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-display text-lg font-bold tabular-nums" style={{ fontFamily: "var(--font-display)" }}>{pctStr(s.consensusScore)}</div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">consensus</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      {/* Round-1 Agreement */}
      <section>
        <SectionHeader icon={Target} title="Round-1 Agreement" hint="Round 1 is the one round everyone shares — % of your round-1 picks that matched the crowd's plurality." />
        {r1Ranked.length === 0 ? (
          <div className="text-sm text-muted-foreground italic">No round-1 picks yet.</div>
        ) : (
          <Card>
            <CardContent className="p-0 divide-y divide-border/60">
              {r1Ranked.map((s, i) => (
                <div key={s.memberId} className="px-4 py-3 flex items-center gap-3 sm:gap-4" data-testid={`og-r1-${s.memberId}`}>
                  <div className="font-display text-xl font-bold w-7 text-center text-muted-foreground" style={{ fontFamily: "var(--font-display)" }}>{i + 1}</div>
                  <MemberAvatar id={s.memberId} name={nameOf(s.memberId)} photoUrl={photoOf(s.memberId)} sizeClass="h-9 w-9" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{nameOf(s.memberId)}</div>
                    <div className="text-xs text-muted-foreground">{s.r1Agree}/{s.r1Total} with the crowd</div>
                  </div>
                  <div className="font-display text-base font-bold tabular-nums shrink-0" style={{ fontFamily: "var(--font-display)" }}>{pctStr(s.r1Agreement)}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      {/* Album Accuracy — dropdown to pick a member */}
      <section>
        <SectionHeader icon={Star} title="Album Accuracy" hint="Pick a member to see their album-by-album results against the community." />
        <div className="mb-4 max-w-xs">
          <Select value={accuracyMemberId} onValueChange={setAccuracyMemberId}>
            <SelectTrigger data-testid="select-accuracy-member"><SelectValue placeholder="Select a member" /></SelectTrigger>
            <SelectContent>
              {members.slice().sort((a, b) => a.displayName.localeCompare(b.displayName)).map(m => (
                <SelectItem key={m.id} value={String(m.id)}>{m.displayName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!selectedAccuracy ? (
          <div className="text-sm text-muted-foreground italic">Choose a member above to view their breakdown.</div>
        ) : selectedAccuracy.perAlbum.length === 0 ? (
          <div className="text-sm text-muted-foreground italic">{nameOf(selectedAccuracy.memberId)} hasn’t made any picks yet.</div>
        ) : (
          <Card data-testid="card-og-accuracy">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center gap-3 mb-3">
                <MemberAvatar id={selectedAccuracy.memberId} name={nameOf(selectedAccuracy.memberId)} photoUrl={photoOf(selectedAccuracy.memberId)} sizeClass="h-9 w-9" />
                <div className="font-display text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>{nameOf(selectedAccuracy.memberId)}</div>
                <div className="ml-auto text-right">
                  <div className="font-display text-base font-bold tabular-nums" style={{ fontFamily: "var(--font-display)" }}>{pctStr(selectedAccuracy.consensusScore)}</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">avg consensus</div>
                </div>
              </div>
              <ul className="space-y-1.5">
                {selectedAccuracy.perAlbum
                  .slice()
                  .sort((a, b) => (albumById.get(a.albumId)?.orderIndex ?? 0) - (albumById.get(b.albumId)?.orderIndex ?? 0))
                  .map(row => {
                    const album = albumById.get(row.albumId);
                    if (!album) return null;
                    return (
                      <li key={row.albumId} className="text-sm flex items-baseline gap-2">
                        <span className="text-xs font-mono text-muted-foreground w-12 shrink-0">{album.year}</span>
                        <span className="font-medium truncate flex-1">{album.title}</span>
                        {row.completed && (
                          <span className={cn("text-[10px] uppercase tracking-wide shrink-0", row.championCorrect ? "text-primary" : "text-muted-foreground")}>
                            {row.championCorrect ? "called it" : "missed"}
                          </span>
                        )}
                        <span className="text-xs font-semibold text-primary shrink-0 tabular-nums w-10 text-right">{pctStr(row.consensusPct)}</span>
                      </li>
                    );
                  })}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Jolly Mon Gallery — top 5 by consensus */}
      <section data-testid="section-og-jolly-mon">
        <SectionHeader icon={Sparkles} title="The Jolly Mon Gallery" hint="The 5 most consensus-aligned members of The Original Parrothead Madness crowd." />
        {topConsensus.length === 0 ? (
          <div className="text-sm text-muted-foreground italic">No picks yet.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {topConsensus.map((s, i) => (
              <Card key={s.memberId} data-testid={`og-jolly-mon-${i + 1}`}>
                <CardContent className="p-4 text-center">
                  <div className="font-display text-xl font-bold text-primary mb-2" style={{ fontFamily: "var(--font-display)" }}>#{i + 1}</div>
                  <div className="flex justify-center mb-2"><MemberAvatar id={s.memberId} name={nameOf(s.memberId)} photoUrl={photoOf(s.memberId)} sizeClass="h-12 w-12" textSizeClass="text-lg" /></div>
                  <div className="font-semibold text-sm truncate">{nameOf(s.memberId)}</div>
                  <div className="font-display text-lg font-bold tabular-nums mt-1" style={{ fontFamily: "var(--font-display)" }}>{pctStr(s.consensusScore)}</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">consensus</div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Lost Shakers — bottom 5 by consensus */}
      {bottomConsensus.length > 0 && (
        <section data-testid="section-og-lost-shakers">
          <SectionHeader icon={ThumbsDown} title="The Lost Shakers of Salt" hint="The 5 most contrarian members — least aligned with the crowd. No shade." destructive />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {bottomConsensus.map((s, i) => (
              <Card key={s.memberId} className="border-destructive/30" data-testid={`og-lost-shaker-${i + 1}`}>
                <CardContent className="p-4 text-center">
                  <div className="font-display text-xl font-bold text-destructive mb-2" style={{ fontFamily: "var(--font-display)" }}>#{i + 1}</div>
                  <div className="flex justify-center mb-2"><MemberAvatar id={s.memberId} name={nameOf(s.memberId)} photoUrl={photoOf(s.memberId)} sizeClass="h-12 w-12" textSizeClass="text-lg" /></div>
                  <div className="font-semibold text-sm truncate">{nameOf(s.memberId)}</div>
                  <div className="font-display text-lg font-bold tabular-nums mt-1 text-destructive" style={{ fontFamily: "var(--font-display)" }}>{pctStr(s.consensusScore)}</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">consensus</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* OG album winners */}
      <section>
        <SectionHeader icon={Trophy} title="The Original Parrothead Madness Album Winners" />
        {ogWinners.length === 0 ? (
          <div className="text-sm text-muted-foreground italic">No Original Parrothead Madness winners yet — once enough brackets are filled, winners appear here.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ogWinners.map(w => (
              <Link key={w.albumId} href={`/albums/${w.albumId}`} className="block" data-testid={`og-winner-row-${w.albumId}`}>
                <Card className="hover-elevate active-elevate">
                  <CardContent className="p-4 flex items-center gap-3">
                    <AlbumCover album={w.album!} sizeClass="h-12 w-12" roundedClass="rounded-md" />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm truncate">{w.winner}</div>
                      <div className="text-xs text-muted-foreground truncate">{w.album!.title} • {w.album!.year} • {w.voterCount} {w.voterCount === 1 ? "voter" : "voters"}</div>
                    </div>
                    <div className="h-9 w-9 rounded-md flex items-center justify-center shrink-0 bg-muted" aria-hidden="true">
                      <Users className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Voting Agreement — top 10 + pair dropdown */}
      <section>
        <SectionHeader icon={Handshake} title="Voting Agreement" hint="Top round-1 agreement pairs, plus pick any two members to compare." />
        <TopAgreementPairs members={members} topPairs={topPairs} />

        <div className="mt-5">
          <div className="text-sm font-semibold mb-2">Compare two members</div>
          <div className="flex flex-col sm:flex-row gap-3 max-w-xl">
            <Select value={pairA} onValueChange={setPairA}>
              <SelectTrigger data-testid="select-pair-a"><SelectValue placeholder="First member" /></SelectTrigger>
              <SelectContent>
                {members.slice().sort((a, b) => a.displayName.localeCompare(b.displayName)).map(m => (
                  <SelectItem key={m.id} value={String(m.id)} disabled={String(m.id) === pairB}>{m.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={pairB} onValueChange={setPairB}>
              <SelectTrigger data-testid="select-pair-b"><SelectValue placeholder="Second member" /></SelectTrigger>
              <SelectContent>
                {members.slice().sort((a, b) => a.displayName.localeCompare(b.displayName)).map(m => (
                  <SelectItem key={m.id} value={String(m.id)} disabled={String(m.id) === pairA}>{m.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {pairA && pairB && pairA !== pairB && (
            <Card className="mt-3" data-testid="card-pair-agreement">
              <CardContent className="p-4">
                {pairAgreement.isLoading ? (
                  <div className="text-sm text-muted-foreground">Comparing…</div>
                ) : pairAgreement.data ? (
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <MemberAvatar id={Number(pairA)} name={nameOf(Number(pairA))} photoUrl={photoOf(Number(pairA))} sizeClass="h-8 w-8" />
                      <span className="text-sm font-medium truncate">{nameOf(Number(pairA))}</span>
                      <span className="text-xs text-muted-foreground">+</span>
                      <MemberAvatar id={Number(pairB)} name={nameOf(Number(pairB))} photoUrl={photoOf(Number(pairB))} sizeClass="h-8 w-8" />
                      <span className="text-sm font-medium truncate">{nameOf(Number(pairB))}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-display text-lg font-bold tabular-nums" style={{ fontFamily: "var(--font-display)" }}>
                        {pairAgreement.data.shared === 0 ? "—" : pctStr(pairAgreement.data.pct)}
                      </div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {pairAgreement.data.agreed}/{pairAgreement.data.shared} shared
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Couldn’t load that comparison.</div>
                )}
                {pairAgreement.data && pairAgreement.data.albumsBothCompleted > 0 && (
                  <div className="mt-2 pt-2 border-t border-border/60 text-xs text-muted-foreground">
                    Same champion on {pairAgreement.data.sameChampionCount}/{pairAgreement.data.albumsBothCompleted} albums both finished.
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {/* Favorite song lookup */}
      <section>
        <SectionHeader icon={Heart} title="Favorite Songs" hint="Pick a member to see their favorite track from each album." />
        <div className="mb-4 max-w-xs">
          <Select value={favMemberId} onValueChange={setFavMemberId}>
            <SelectTrigger data-testid="select-fav-member"><SelectValue placeholder="Select a member" /></SelectTrigger>
            <SelectContent>
              {members.slice().sort((a, b) => a.displayName.localeCompare(b.displayName)).map(m => (
                <SelectItem key={m.id} value={String(m.id)}>{m.displayName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!favMemberId ? (
          <div className="text-sm text-muted-foreground italic">Choose a member to view their favorites.</div>
        ) : favsForMember.length === 0 ? (
          <div className="text-sm text-muted-foreground italic">{nameOf(Number(favMemberId))} hasn’t marked any favorites yet.</div>
        ) : (
          <Card data-testid="card-og-favorites">
            <CardContent className="p-4 sm:p-5">
              <ul className="space-y-1.5">
                {favsForMember.map(({ fav, album }) => (
                  <li key={fav.albumId} className="text-sm flex items-baseline gap-2">
                    <span className="text-xs font-mono text-muted-foreground w-12 shrink-0">{album!.year}</span>
                    <span className="font-medium truncate flex-1">{fav.songTitle}</span>
                    <span className="text-xs text-muted-foreground truncate hidden sm:inline">{album!.title}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>
    </>
  );
}

// Top 10 round-1 agreement pairs across all OG members. Round 1 / prelims is the
// ONLY round every member shares identical matchups, so these are exact pairwise
// agreement figures computed server-side (not a heuristic).
function TopAgreementPairs({ members, topPairs }: { members: { id: number; displayName: string; photoUrl?: string | null }[]; topPairs: OGTopPair[] }) {
  const nameOf = (id: number) => members.find(m => m.id === id)?.displayName ?? "Unknown";
  const photoOf = (id: number) => members.find(m => m.id === id)?.photoUrl ?? null;

  if (topPairs.length === 0) {
    return <div className="text-sm text-muted-foreground italic">Not enough round-1 picks yet to rank pairs.</div>;
  }

  return (
    <Card>
      <CardContent className="p-0 divide-y divide-border/60">
        {topPairs.map((p, i) => (
          <div key={`${p.memberA}-${p.memberB}`} className="px-4 py-3 flex items-center gap-3" data-testid={`og-agreement-pair-${i + 1}`}>
            <div className="font-display text-lg font-bold w-6 text-center text-muted-foreground shrink-0" style={{ fontFamily: "var(--font-display)" }}>{i + 1}</div>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <MemberAvatar id={p.memberA} name={nameOf(p.memberA)} photoUrl={photoOf(p.memberA)} sizeClass="h-7 w-7" textSizeClass="text-xs" />
              <span className="text-sm font-medium truncate">{nameOf(p.memberA)}</span>
              <span className="text-xs text-muted-foreground">+</span>
              <MemberAvatar id={p.memberB} name={nameOf(p.memberB)} photoUrl={photoOf(p.memberB)} sizeClass="h-7 w-7" textSizeClass="text-xs" />
              <span className="text-sm font-medium truncate">{nameOf(p.memberB)}</span>
            </div>
            <div className="text-right shrink-0">
              <div className="font-display text-base font-bold tabular-nums" style={{ fontFamily: "var(--font-display)" }}>{pctStr(p.pct)}</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{p.agreed}/{p.shared} round 1</div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
