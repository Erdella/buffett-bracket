import { useMutation, useQuery } from "@tanstack/react-query";
import type { Album, MyBracketData, PersonalMatch, CommunityStandings } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { MemberAuthButton } from "@/components/member-auth-button";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Check, Trophy, Crown, ListOrdered, CheckCircle2, Vote } from "lucide-react";

/**
 * Human label for a round given its position relative to the final round.
 *   last round        -> Championship (4 pts)
 *   second-to-last    -> Semifinals   (2 pts)
 *   third-to-last     -> Quarterfinals (1 pt)
 *   anything earlier  -> Round N / Prelims (1 pt)
 */
export function roundLabel(round: number, totalRounds: number): string {
  if (round === totalRounds) return "Championship";
  if (round === totalRounds - 1) return "Semifinals";
  if (round === totalRounds - 2) return "Quarterfinals";
  if (round === 1) return "Preliminaries";
  return `Round ${round}`;
}

function pointsForRound(round: number, totalRounds: number): number {
  if (round === totalRounds) return 4;
  if (round === totalRounds - 1) return 2;
  return 1;
}

/**
 * The community voting panel (new model). Each signed-in member fills out their
 * OWN bracket: they pick winners round by round and their picks advance on
 * their personal bracket. Below the bracket we show the live weighted standings
 * for the whole crowd.
 */
export function CommunityBracket({ album }: { album: Album }) {
  const { member } = useAuth();
  const { toast } = useToast();

  const myBracket = useQuery<MyBracketData>({
    queryKey: ["/api/albums", album.id, "my-bracket"],
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
  const { totalRounds } = bracket;

  return (
    <div className="space-y-6">
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

      {/* Round-by-round personal bracket */}
      <div className="space-y-5">
        {bracket.rounds.map((matches, ri) => {
          const round = ri + 1;
          const pts = pointsForRound(round, totalRounds);
          return (
            <div key={round} className="space-y-3" data-testid={`round-${round}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-display font-bold text-base" style={{ fontFamily: "var(--font-display)" }}>
                  {roundLabel(round, totalRounds)}
                </h3>
                <Badge variant="secondary" className="text-[10px] gap-1">
                  <Trophy className="h-3 w-3" /> {pts} {pts === 1 ? "pt" : "pts"} / pick
                </Badge>
              </div>
              <div className="grid gap-3">
                {matches.map(m => (
                  <PersonalMatchCard
                    key={`${round}-${m.matchIndex}`}
                    match={m}
                    canPick={!!member}
                    pending={pickMutation.isPending}
                    onPick={(song) =>
                      pickMutation.mutate({ round, matchIndex: m.matchIndex, songPicked: song })
                    }
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Live weighted standings for the whole crowd */}
      <CommunityStandingsPanel album={album} />
    </div>
  );
}

function PersonalMatchCard({
  match, canPick, pending, onPick,
}: {
  match: PersonalMatch;
  canPick: boolean;
  pending: boolean;
  onPick: (song: string) => void;
}) {
  const { songA, songB, pick } = match;
  // A bye (single song) just carries forward — no choice to make.
  const isBye = (!!songA && !songB) || (!!songB && !songA);
  const byeSong = songA || songB;

  if (isBye) {
    return (
      <Card className="border-card-border bg-muted/30">
        <CardContent className="p-3 sm:p-4 flex items-center justify-between gap-2">
          <span className="font-medium text-sm">{byeSong}</span>
          <Badge variant="outline" className="text-[10px]">Bye — advances</Badge>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-card-border overflow-hidden">
      <CardContent className="p-3 sm:p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <PickOption
            label={songA}
            selected={pick === songA}
            canPick={canPick}
            pending={pending}
            testId={`pick-a-${match.round}-${match.matchIndex}`}
            onClick={() => songA && onPick(songA)}
          />
          <PickOption
            label={songB}
            selected={pick === songB}
            canPick={canPick}
            pending={pending}
            testId={`pick-b-${match.round}-${match.matchIndex}`}
            onClick={() => songB && onPick(songB)}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function PickOption({
  label, selected, canPick, pending, testId, onClick,
}: {
  label: string | null;
  selected: boolean;
  canPick: boolean;
  pending: boolean;
  testId: string;
  onClick: () => void;
}) {
  if (!label) return <div className="hidden sm:block" />;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!canPick || pending}
      data-testid={testId}
      aria-pressed={selected}
      className={cn(
        "relative w-full text-left rounded-lg border p-3 transition-colors",
        "min-h-[3.25rem] flex items-center justify-between gap-2",
        selected ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border bg-card",
        canPick && !pending ? "hover-elevate active-elevate cursor-pointer" : "cursor-default",
      )}
    >
      <span className="font-medium text-sm leading-snug pr-2">{label}</span>
      {selected && <Check className="h-4 w-4 text-primary shrink-0" />}
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

  const { ranked, winner, voterCount, totalRounds } = standings.data;
  const maxPoints = ranked.length > 0 ? ranked[0].points : 0;
  // Detect a true tie at the top (several share the leading point total).
  const topTie = ranked.length > 1 && ranked[0].points > 0 && ranked[0].points === ranked[1].points;

  return (
    <Card className="border-card-border">
      <div className="sun-gradient h-1.5 w-full" />
      <CardContent className="p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-display font-bold text-base flex items-center gap-2" style={{ fontFamily: "var(--font-display)" }}>
            <ListOrdered className="h-4 w-4 text-primary" /> Community standings
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
            No community picks yet. Be the first to fill out a bracket.
          </p>
        ) : (
          <>
            {winner && (
              <div className="rounded-lg bg-primary/10 border border-primary/30 p-3 flex items-center gap-3">
                <Crown className="h-5 w-5 text-primary shrink-0" />
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    {topTie ? "Leading (tie)" : "Community winner"}
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
                        .map(b => `${b.votes}×${roundLabel(b.round, totalRounds).split(" ")[0]}`)
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
