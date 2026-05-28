import { useMutation, useQuery } from "@tanstack/react-query";
import type { Album, CommunityAlbumData, CommunityTally } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Check, Lock, Users, Vote } from "lucide-react";

/**
 * Community voting panel for one album. Shows the round currently OPEN for
 * community votes as a set of tappable head-to-head cards. Members vote for
 * themselves; live tallies update after each vote. When the round is closed,
 * the same matchups render as read-only results.
 */
export function CommunityVoting({ album }: { album: Album }) {
  const { member } = useAuth();
  const { toast } = useToast();

  const community = useQuery<CommunityAlbumData>({
    queryKey: ["/api/albums", album.id, "community"],
    // Light polling so tallies feel live during an active round.
    refetchInterval: 15_000,
  });

  const voteMutation = useMutation({
    mutationFn: async (vars: { matchId: number; songVotedFor: string }) => {
      const res = await apiRequest("POST", "/api/community/vote", vars);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/albums", album.id, "community"] });
    },
    onError: (err: Error) => {
      toast({
        title: "Vote not saved",
        description: err.message.replace(/^\d+:\s*/, ""),
        variant: "destructive",
      });
    },
  });

  if (!community.data) {
    return <div className="h-40 rounded-xl bg-muted animate-pulse" />;
  }

  const { round, tallies, myVotes } = community.data;
  const roundOpenForThisAlbum = round.isOpen && round.albumId === album.id && round.round != null;

  // Matches to show: the open round if active for this album, otherwise nothing here.
  const openMatches = roundOpenForThisAlbum
    ? tallies.filter(t => t.round === round.round)
    : [];

  if (!roundOpenForThisAlbum) {
    return (
      <Card className="border-dashed border-2">
        <CardContent className="py-8 text-center space-y-2">
          <div className="mx-auto h-11 w-11 rounded-full bg-muted flex items-center justify-center">
            <Lock className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="font-medium">Community voting is closed right now</div>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            There's no open round for this album. Check back when the next matchup goes live, or
            browse the results below.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Badge className="bg-primary text-primary-foreground gap-1">
            <Vote className="h-3 w-3" /> Round {round.round} — Voting open
          </Badge>
        </div>
        {member ? (
          <span className="text-xs text-muted-foreground">
            Voting as <strong className="text-foreground">{member.displayName}</strong>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Sign in to cast your vote</span>
        )}
      </div>

      {!member && (
        <Card className="bg-primary/5 border-primary/30">
          <CardContent className="py-4 flex items-center gap-3">
            <Users className="h-5 w-5 text-primary shrink-0" />
            <p className="text-sm">
              You can see the live tally, but you'll need to{" "}
              <strong>sign in to vote</strong>. Use the button up top — it's just your email, no password.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {openMatches.map(t => (
          <MatchVoteCard
            key={t.matchId}
            tally={t}
            myVote={myVotes[t.matchId] ?? null}
            canVote={!!member}
            pending={voteMutation.isPending}
            onVote={(song) => voteMutation.mutate({ matchId: t.matchId, songVotedFor: song })}
          />
        ))}
      </div>
    </div>
  );
}

function MatchVoteCard({
  tally, myVote, canVote, pending, onVote,
}: {
  tally: CommunityTally;
  myVote: string | null;
  canVote: boolean;
  pending: boolean;
  onVote: (song: string) => void;
}) {
  const { songA, songB, aVotes, bVotes, total } = tally;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  return (
    <Card className="border-card-border overflow-hidden">
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Matchup {tally.matchIndex + 1}
          </span>
          <span className="text-[11px] text-muted-foreground" data-testid={`text-total-${tally.matchId}`}>
            {total} {total === 1 ? "vote" : "votes"}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <VoteOption
            label={songA}
            votes={aVotes}
            pct={pct(aVotes)}
            selected={myVote === songA}
            canVote={canVote}
            pending={pending}
            testId={`vote-a-${tally.matchId}`}
            onClick={() => songA && onVote(songA)}
          />
          <VoteOption
            label={songB}
            votes={bVotes}
            pct={pct(bVotes)}
            selected={myVote === songB}
            canVote={canVote}
            pending={pending}
            testId={`vote-b-${tally.matchId}`}
            onClick={() => songB && onVote(songB)}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function VoteOption({
  label, votes, pct, selected, canVote, pending, testId, onClick,
}: {
  label: string | null;
  votes: number;
  pct: number;
  selected: boolean;
  canVote: boolean;
  pending: boolean;
  testId: string;
  onClick: () => void;
}) {
  if (!label) return <div />;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!canVote || pending}
      data-testid={testId}
      aria-pressed={selected}
      className={cn(
        "relative w-full text-left rounded-lg border p-3 overflow-hidden transition-colors",
        "min-h-[3.5rem] flex items-center justify-between gap-2",
        selected
          ? "border-primary bg-primary/10 ring-1 ring-primary"
          : "border-border bg-card",
        canVote && !pending ? "hover-elevate active-elevate cursor-pointer" : "cursor-default",
      )}
    >
      {/* Tally fill bar */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 transition-all duration-500",
          selected ? "bg-primary/15" : "bg-muted/60",
        )}
        style={{ width: `${pct}%` }}
      />
      <span className="relative font-medium text-sm leading-snug pr-2">{label}</span>
      <span className="relative flex items-center gap-1.5 shrink-0">
        {selected && <Check className="h-4 w-4 text-primary" />}
        <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
      </span>
    </button>
  );
}
