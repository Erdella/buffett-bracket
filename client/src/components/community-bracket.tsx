import { useMutation, useQuery } from "@tanstack/react-query";
import type { Album, MyBracketData, PersonalMatch, CommunityStandings, AlbumSeeds, MainSlot } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { MemberAuthButton } from "@/components/member-auth-button";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Check, Trophy, Crown, ListOrdered, CheckCircle2, Vote, MousePointerClick } from "lucide-react";

/**
 * Human label for a round given its position relative to the final round, and
 * whether round 1 is a preliminary (play-in) round.
 *   last round        -> Championship  (4 pts)
 *   second-to-last    -> Semifinals    (2 pts)
 *   third-to-last     -> Quarterfinals (1 pt)
 *   round 1 (prelims) -> Preliminaries (1 pt)
 *   anything earlier  -> Round N       (1 pt)
 */
export function roundLabel(round: number, totalRounds: number, hasPrelims = false): string {
  // Prelims (play-in) are always round 1 when present; check first so the
  // generic "Round of 16" position check below can't shadow it.
  if (hasPrelims && round === 1) return "Preliminaries";
  if (round === totalRounds) return "Championship";
  if (round === totalRounds - 1) return "Semifinals";
  if (round === totalRounds - 2) return "Quarterfinals";
  if (round === totalRounds - 3) return "Round of 16";
  return `Round ${round}`;
}

/** Short, all-caps column header used on the bracket tree. */
function roundHeader(round: number, totalRounds: number, hasPrelims: boolean): string {
  if (hasPrelims && round === 1) return "PRELIMINARY";
  if (round === totalRounds) return "CHAMPIONSHIP";
  if (round === totalRounds - 1) return "SEMIFINALS";
  if (round === totalRounds - 2) return "QUARTERFINALS";
  if (round === totalRounds - 3) return "ROUND OF 16";
  return `ROUND ${round}`;
}

function pointsForRound(round: number, totalRounds: number): number {
  if (round === totalRounds) return 4;
  if (round === totalRounds - 1) return 2;
  return 1;
}

// ---------------------------------------------------------------------------
// Full-tree skeleton
// ---------------------------------------------------------------------------
// The server returns a JAGGED bracket: later rounds only exist once the member
// has picked their way there. To draw the classic left-to-right tree with TBD
// slots for every future matchup, we pad the live rounds out to `totalRounds`,
// halving the match count each round. Live matches keep their real songs/pick;
// padded matches are all-TBD placeholders (not yet tappable).

interface TreeMatch extends PersonalMatch {
  live: boolean; // true when this matchup is materialized (its songs are known)
}

// Number of matchups a round should have in the FINISHED bracket. Counting
// back from the championship, the last round has 1 match, semis 2, quarters 4,
// etc. (a power of two). Round 1 is special when the bracket has prelims: its
// size is whatever the live round-1 data says (the play-in games), so we take
// that from `firstCount`.
function expectedRoundSize(round: number, totalRounds: number, hasPrelims: boolean, firstCount: number): number {
  if (hasPrelims && round === 1) return firstCount;
  return Math.pow(2, totalRounds - round);
}

/**
 * Build the first-main-round (quarterfinals) PLACEHOLDER matchups from the
 * album's `mainSlots`, pre-filling the directly-seeded "bye" song in each
 * matchup while leaving the prelim-winner slot as TBD (null) until that prelim
 * is decided. Consecutive slot pairs (0,1),(2,3),... form the matchups. These
 * are NOT live (not tappable) — they're a preview so members can see which top
 * seed is waiting for them. The server replaces them with the real live round
 * once the member has decided every feeding prelim.
 */
function placeholderMainRound(round: number, mainSlots: MainSlot[]): TreeMatch[] {
  const matches: TreeMatch[] = [];
  for (let i = 0; i < mainSlots.length; i += 2) {
    const a = mainSlots[i];
    const b = mainSlots[i + 1];
    const songOf = (s: MainSlot | undefined): string | null =>
      s && s.kind === "direct" ? s.song : null;
    matches.push({
      round,
      matchIndex: matches.length,
      songA: songOf(a),
      songB: songOf(b),
      pick: null,
      live: false,
    });
  }
  return matches;
}

function buildTree(
  rounds: PersonalMatch[][],
  totalRounds: number,
  hasPrelims: boolean,
  mainSlots: MainSlot[],
): TreeMatch[][] {
  const tree: TreeMatch[][] = [];
  const firstCount = rounds[0]?.length ?? 0;
  // The first main round is round 2 when there are prelims, else round 1.
  const firstMainRound = hasPrelims ? 2 : 1;
  for (let r = 1; r <= totalRounds; r++) {
    const live = rounds[r - 1];
    if (live && live.length > 0) {
      tree.push(live.map(m => ({ ...m, live: true })));
      continue;
    }
    // Quarterfinals not yet live: pre-fill the bye (direct-seed) song in each
    // matchup so the top seeds are visible while their prelim opponents are
    // still TBD. Only applies when we actually have mainSlots (prelim albums).
    if (r === firstMainRound && hasPrelims && mainSlots.length > 0) {
      tree.push(placeholderMainRound(r, mainSlots));
      continue;
    }
    // Otherwise reserve the correct number of all-TBD slots so the tree shape
    // is right even before the member has picked their way there.
    const count = Math.max(1, expectedRoundSize(r, totalRounds, hasPrelims, firstCount));
    const placeholder: TreeMatch[] = [];
    for (let i = 0; i < count; i++) {
      placeholder.push({ round: r, matchIndex: i, songA: null, songB: null, pick: null, live: false });
    }
    tree.push(placeholder);
  }
  return tree;
}

/**
 * The community voting panel. Each signed-in member fills out their OWN bracket
 * on a classic left-to-right tournament tree: they tap the song they prefer in
 * each matchup and it advances to the next round. Below the tree we show the
 * live weighted standings for the whole crowd.
 */
export function CommunityBracket({ album }: { album: Album }) {
  const { member } = useAuth();
  const { toast } = useToast();

  const myBracket = useQuery<MyBracketData>({
    queryKey: ["/api/albums", album.id, "my-bracket"],
  });

  // Seed order (public) lets us show a seed number next to every song, just
  // like a real tournament bracket. Index 0 == seed 1 (strongest).
  const seeds = useQuery<AlbumSeeds>({
    queryKey: ["/api/albums", album.id, "seeds"],
  });

  const pickMutation = useMutation({
    mutationFn: async (vars: { round: number; matchIndex: number; songPicked: string }) => {
      const res = await apiRequest("POST", "/api/community/pick", { albumId: album.id, ...vars });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/albums", album.id, "my-bracket"] });
      queryClient.invalidateQueries({ queryKey: ["/api/albums", album.id, "community-standings"] });
    },
    onError: (err: Error) => {
      toast({
        title: "Pick not saved",
        description: err.message.replace(/^\d+:\s*/, ""),
        variant: "destructive",
      });
    },
  });

  if (!myBracket.data) {
    return <div className="h-48 rounded-xl bg-muted animate-pulse" />;
  }

  if (!myBracket.data.available || !myBracket.data.bracket) {
    return (
      <Card className="border-dashed border-2">
        <CardContent className="py-8 text-center space-y-2">
          <div className="font-medium">No bracket for this album yet</div>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Once the round-1 matchups are set, you'll be able to pick your winners all the way to the championship.
          </p>
        </CardContent>
      </Card>
    );
  }

  const bracket = myBracket.data.bracket;
  const { totalRounds, hasPrelims } = bracket;

  // seedOf: 1-based seed number for a song title (undefined when unknown).
  const seedOf = (song: string | null): number | undefined => {
    if (!song || !seeds.data) return undefined;
    const i = seeds.data.seedOrder.indexOf(song);
    return i >= 0 ? i + 1 : undefined;
  };

  const tree = buildTree(bracket.rounds, totalRounds, hasPrelims, seeds.data?.mainSlots ?? []);

  // First-timer hint: the earliest live, un-picked, real (non-bye) matchup.
  const hasAnyPick = bracket.rounds.some(matches => matches.some(m => !!m.pick));
  let hintKey: string | null = null;
  if (member && !hasAnyPick) {
    outer: for (const round of tree) {
      for (const m of round) {
        const isBye = (!!m.songA && !m.songB) || (!!m.songB && !m.songA);
        if (m.live && !isBye && !m.pick) {
          hintKey = `${m.round}-${m.matchIndex}`;
          break outer;
        }
      }
    }
  }

  return (
    <div className="space-y-6">
      {hasPrelims && (
        <Card className="border-primary/30 bg-primary/5" data-testid="card-prelims-note">
          <CardContent className="py-3">
            <p className="text-[11px] text-muted-foreground">
              This album has a few extra songs, so the lowest seeds face off in a{" "}
              <strong className="text-foreground">preliminary round</strong> first. The top seeds wait
              in the quarterfinals, where the prelim winners join them.
            </p>
          </CardContent>
        </Card>
      )}

      {!member && (
        <Card className="bg-primary/5 border-primary/30">
          <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <Vote className="h-5 w-5 text-primary shrink-0" />
            <p className="text-sm flex-1">
              Fill out your own bracket — pick a winner in every matchup, all the way to the championship.
              <strong> Sign in with your email</strong> (no password) to start voting.
            </p>
            <MemberAuthButton />
          </CardContent>
        </Card>
      )}

      {member && !bracket.complete && (
        <Card className="border-primary/40 bg-primary/5" data-testid="card-how-to-vote">
          <CardContent className="py-3.5 flex items-start gap-3">
            <MousePointerClick className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <p className="text-sm leading-snug">
              <strong>How to vote:</strong> tap the song you like better in each matchup. Your pick
              advances to the next round, and the bracket fills in to the right — keep going until one
              song reaches the championship.
            </p>
          </CardContent>
        </Card>
      )}

      {member && bracket.complete && bracket.champion && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="py-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
            <div className="text-sm">
              <span className="font-semibold">Your bracket is complete.</span>{" "}
              Your champion for <em>{album.title}</em> is{" "}
              <strong className="text-foreground" data-testid="text-my-champion">{bracket.champion}</strong>. You can still change any pick.
            </div>
          </CardContent>
        </Card>
      )}

      {/* The bracket tree. Horizontally scrollable on narrow screens so the full
          left-to-right layout stays intact on phones. */}
      <BracketTree
        tree={tree}
        totalRounds={totalRounds}
        hasPrelims={hasPrelims}
        champion={bracket.complete ? bracket.champion : null}
        canPick={!!member}
        pending={pickMutation.isPending}
        hintKey={hintKey}
        seedOf={seedOf}
        onPick={(round, matchIndex, song) =>
          pickMutation.mutate({ round, matchIndex, songPicked: song })
        }
      />

      {/* Live weighted standings for the whole crowd */}
      <CommunityStandingsPanel album={album} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bracket tree
// ---------------------------------------------------------------------------

function BracketTree({
  tree, totalRounds, hasPrelims, champion, canPick, pending, hintKey, seedOf, onPick,
}: {
  tree: TreeMatch[][];
  totalRounds: number;
  hasPrelims: boolean;
  champion: string | null;
  canPick: boolean;
  pending: boolean;
  hintKey: string | null;
  seedOf: (song: string | null) => number | undefined;
  onPick: (round: number, matchIndex: number, song: string) => void;
}) {
  return (
    <div
      className="relative overflow-x-auto rounded-xl border border-card-border bg-muted/20 p-4 sm:p-6"
      data-testid="bracket-tree"
    >
      <div className="flex items-stretch min-w-max">
        {tree.map((matches, ri) => {
          const round = ri + 1;
          const pts = pointsForRound(round, totalRounds);
          const isLast = round === totalRounds;
          const isFirst = ri === 0;
          return (
            <div key={round} className="flex items-stretch">
              {/* Connector column feeding INTO this round from the previous one.
                  Each next-round matchup is joined to its two feeders by an
                  elbow: two horizontal stubs, a vertical span between them, and
                  a horizontal line out to this column. */}
              {!isFirst && (
                <Connectors count={matches.length} headerOffset />
              )}

              <div
                className="flex flex-col min-w-[210px]"
                data-testid={`tree-round-${round}`}
              >
                {/* Column header */}
                <div className="mb-3 h-6 flex items-center gap-2 flex-wrap">
                  <span
                    className={cn(
                      "text-[11px] font-bold uppercase tracking-[0.15em]",
                      isLast ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {roundHeader(round, totalRounds, hasPrelims)}
                    {isLast && " 🏆"}
                  </span>
                  <Badge variant="secondary" className="text-[9px] gap-1 px-1.5 py-0">
                    <Trophy className="h-2.5 w-2.5" /> {pts}{pts === 1 ? "pt" : "pts"}
                  </Badge>
                </div>

                {/* Matchups evenly distributed so a later matchup aligns with
                    the midpoint of its two feeder matchups. */}
                <div className="flex flex-1 flex-col justify-around gap-6">
                  {matches.map(m => (
                    <TreeMatchCard
                      key={`${round}-${m.matchIndex}`}
                      match={m}
                      isChampionshipWinner={isLast && !!champion}
                      champion={champion}
                      canPick={canPick}
                      pending={pending}
                      hinting={hintKey === `${round}-${m.matchIndex}`}
                      seedOf={seedOf}
                      onPick={(song) => onPick(round, m.matchIndex, song)}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}

        {/* Connector into the trophy, then the trophy/champion column. */}
        <Connectors count={1} headerOffset />
        <div className="flex flex-col min-w-[150px]">
          <div className="mb-3 h-6" />
          <div className="flex flex-1 items-center">
            <div
              className={cn(
                "w-full rounded-lg border p-4 text-center transition-colors",
                champion ? "border-primary bg-primary/10" : "border-dashed border-border bg-background/40",
              )}
              data-testid="tree-champion"
            >
              <Crown className={cn("h-6 w-6 mx-auto mb-1.5", champion ? "text-primary" : "text-muted-foreground/40")} />
              <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                Your champion
              </div>
              <div className="font-display font-bold text-sm mt-0.5 leading-snug" style={{ fontFamily: "var(--font-display)" }}>
                {champion ?? <span className="italic font-normal text-muted-foreground">TBD</span>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The connector column between two rounds. It contains `count` elbow cells —
 * one per matchup in the round on the RIGHT. Each elbow joins the vertical
 * span between a pair of feeder matchups (left) to a single outgoing line at
 * their midpoint (right), producing the classic bracket "⊐" shape.
 *
 * The connector column uses the same `justify-around` distribution as the
 * round columns, and `headerOffset` reserves the header height (h-6 + mb-3 =
 * 1.5rem + 0.75rem) so the elbows line up with the cards, not the headers.
 */
function Connectors({ count, headerOffset }: { count: number; headerOffset?: boolean }) {
  return (
    <div className="flex flex-col w-6 sm:w-9 shrink-0" aria-hidden>
      {headerOffset && <div className="mb-3 h-6" />}
      <div className="flex flex-1 flex-col justify-around">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="relative flex-1 min-h-[3rem]">
            {/* Top half: right + bottom border forms the top arm + the vertical
                riser's upper portion. */}
            <div className="absolute left-0 right-1/2 top-0 h-1/2 border-r border-border" />
            {/* Bottom half: right border continues the vertical riser downward. */}
            <div className="absolute left-0 right-1/2 top-1/2 h-1/2 border-r border-border" />
            {/* Outgoing horizontal line at the vertical midpoint. */}
            <div className="absolute left-1/2 right-0 top-1/2 border-t border-border" />
          </div>
        ))}
      </div>
    </div>
  );
}

function TreeMatchCard({
  match, champion, isChampionshipWinner, canPick, pending, hinting, seedOf, onPick,
}: {
  match: TreeMatch;
  champion: string | null;
  isChampionshipWinner: boolean;
  canPick: boolean;
  pending: boolean;
  hinting: boolean;
  seedOf: (song: string | null) => number | undefined;
  onPick: (song: string) => void;
}) {
  const { songA, songB, pick, live } = match;
  const hasPick = !!pick;

  return (
    <div
      className={cn(
        "relative rounded-lg border overflow-hidden transition-colors",
        hasPick ? "border-primary/50" : "border-card-border",
        hinting && "ring-2 ring-primary/70",
      )}
      data-testid={`match-${match.round}-${match.matchIndex}`}
    >
      {hinting && canPick && (
        <span
          className="pointer-events-none absolute -inset-px rounded-lg ring-2 ring-primary/50 animate-pulse"
          aria-hidden
        />
      )}
      <TreeSlot
        song={songA}
        seed={seedOf(songA)}
        selected={pick === songA}
        dimmed={hasPick && pick !== songA}
        live={live}
        canPick={canPick}
        pending={pending}
        isChampionshipWinner={isChampionshipWinner && pick === songA}
        testId={`pick-a-${match.round}-${match.matchIndex}`}
        onClick={() => songA && onPick(songA)}
      />
      <div className="h-px bg-card-border" aria-hidden />
      <TreeSlot
        song={songB}
        seed={seedOf(songB)}
        selected={pick === songB}
        dimmed={hasPick && pick !== songB}
        live={live}
        canPick={canPick}
        pending={pending}
        isChampionshipWinner={isChampionshipWinner && pick === songB}
        testId={`pick-b-${match.round}-${match.matchIndex}`}
        onClick={() => songB && onPick(songB)}
      />
    </div>
  );
}

function TreeSlot({
  song, seed, selected, dimmed, live, canPick, pending, isChampionshipWinner, testId, onClick,
}: {
  song: string | null;
  seed: number | undefined;
  selected: boolean;
  dimmed: boolean;
  live: boolean;
  canPick: boolean;
  pending: boolean;
  isChampionshipWinner: boolean;
  testId: string;
  onClick: () => void;
}) {
  // A TBD slot: no song known yet (future round, or a bye's empty side).
  if (!song) {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/30 min-h-[2.75rem]">
        <span className="italic text-sm text-muted-foreground/60">TBD</span>
      </div>
    );
  }

  const tappable = canPick && live && !pending;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!tappable}
      data-testid={testId}
      aria-pressed={selected}
      className={cn(
        "w-full text-left flex items-center gap-2 px-3 py-2.5 min-h-[2.75rem] transition-colors",
        selected
          ? "bg-primary/15"
          : dimmed
            ? "bg-background/40"
            : "bg-background",
        tappable && !selected && "hover-elevate cursor-pointer",
        !tappable && "cursor-default",
      )}
    >
      {seed !== undefined && (
        <span className="text-[11px] font-mono text-muted-foreground w-5 shrink-0 tabular-nums">
          {seed}
        </span>
      )}
      <span
        className={cn(
          "flex-1 text-sm leading-snug truncate",
          selected ? "font-semibold text-foreground" : dimmed ? "text-muted-foreground" : "font-medium",
        )}
      >
        {song}
      </span>
      {isChampionshipWinner ? (
        <Crown className="h-4 w-4 text-primary shrink-0" />
      ) : selected ? (
        <Check className="h-4 w-4 text-primary shrink-0" />
      ) : null}
    </button>
  );
}

/**
 * Live weighted standings for an album. Ranks every song by total weighted
 * points across all members' picks. Highest-point song is the community winner;
 * ties are listed alphabetically (the server already sorts that way).
 */
export function CommunityStandingsPanel({ album }: { album: Album }) {
  const standings = useQuery<CommunityStandings>({
    queryKey: ["/api/albums", album.id, "community-standings"],
    refetchInterval: 20_000,
  });

  if (!standings.data) {
    return <div className="h-40 rounded-xl bg-muted animate-pulse" />;
  }

  const { ranked, winner, voterCount, totalRounds, hasPrelims } = standings.data;
  const maxPoints = ranked.length > 0 ? ranked[0].points : 0;
  // Detect a true tie at the top (several share the leading point total).
  const topTie = ranked.length > 1 && ranked[0].points > 0 && ranked[0].points === ranked[1].points;

  return (
    <Card className="border-card-border">
      <div className="sun-gradient h-1.5 w-full" />
      <CardContent className="p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-display font-bold text-base flex items-center gap-2" style={{ fontFamily: "var(--font-display)" }}>
            <ListOrdered className="h-4 w-4 text-primary" /> Hardcore Parrotheads standings
          </h3>
          <span className="text-xs text-muted-foreground" data-testid="text-voter-count">
            {voterCount} {voterCount === 1 ? "voter" : "voters"}
          </span>
        </div>

        <p className="text-[11px] text-muted-foreground -mt-1">
          Weighted: every pick scores 1 pt in the early rounds, 2 in the semis, and 4 in the championship.
        </p>

        {ranked.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No Hardcore Parrotheads picks yet. Be the first to fill out a bracket.
          </p>
        ) : (
          <>
            {winner && (
              <div className="rounded-lg bg-primary/10 border border-primary/30 p-3 flex items-center gap-3">
                <Crown className="h-5 w-5 text-primary shrink-0" />
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    {topTie ? "Leading (tie)" : "Hardcore Parrotheads winner"}
                  </div>
                  <div className="font-display font-bold" style={{ fontFamily: "var(--font-display)" }} data-testid="text-community-winner">
                    {winner}
                  </div>
                </div>
              </div>
            )}

            <ol className="space-y-2">
              {ranked.map((row, i) => (
                <li
                  key={row.songTitle}
                  className="flex items-center gap-3"
                  data-testid={`standing-row-${i}`}
                >
                  <span className="text-xs font-mono text-muted-foreground w-5 shrink-0 text-right">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{row.songTitle}</span>
                      <span className="text-sm font-bold tabular-nums shrink-0" data-testid={`standing-points-${i}`}>
                        {row.points} <span className="text-[11px] font-normal text-muted-foreground">pts</span>
                      </span>
                    </div>
                    <Progress
                      value={maxPoints > 0 ? (row.points / maxPoints) * 100 : 0}
                      className="h-1.5 mt-1"
                    />
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {row.breakdown
                        .slice()
                        .sort((a, b) => b.round - a.round)
                        .map(b => `${b.votes}×${roundLabel(b.round, totalRounds, hasPrelims).split(" ")[0]}`)
                        .join(" · ")}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </CardContent>
    </Card>
  );
}
