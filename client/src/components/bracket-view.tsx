import { useMemo } from "react";
import type { BracketMatch, MatchVote, Player } from "@/lib/types";
import { dynamicRoundLabel, groupByRound } from "@/lib/bracket";
import { cn } from "@/lib/utils";
import { Trophy, Trash2 } from "lucide-react";
import { PlayerAvatar } from "@/components/player-avatar";

interface Props {
  matches: BracketMatch[];
  votes: MatchVote[];
  players: Player[];
  onCastVote?: (matchId: number, playerId: number, song: string | null) => void;
  onDeleteRound?: (round: number) => void;
  readOnly?: boolean;
}

export function BracketView({ matches, votes, players, onCastVote, onDeleteRound, readOnly }: Props) {
  const rounds = useMemo(() => groupByRound(matches), [matches]);
  const latestRound = rounds.length > 0 ? rounds[rounds.length - 1][0] : 0;
  const latestRoundSize = rounds.length > 0 ? rounds[rounds.length - 1][1].length : 0;
  const prevRoundSize = rounds.length > 1 ? rounds[rounds.length - 2][1].length : 0;
  // A true Final is a 1-match round preceded by a 2-match Semifinal.
  // A 1-match Round 1 (or any 1-match round whose predecessor wasn't a Semi)
  // is a prelim play-in, not the championship.
  const isFinalRound = latestRoundSize === 1 && prevRoundSize === 2;
  const finalMatch = isFinalRound ? rounds[rounds.length - 1][1][0] : null;
  const champion = finalMatch?.winner ?? null;

  // Index votes by matchId for fast lookup
  const votesByMatch = useMemo(() => {
    const map = new Map<number, MatchVote[]>();
    for (const v of votes) {
      const list = map.get(v.matchId);
      if (list) list.push(v);
      else map.set(v.matchId, [v]);
    }
    return map;
  }, [votes]);

  return (
    <div className="space-y-6">
      {champion && (
        <div className="rounded-xl border border-primary/40 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-5 sm:p-6 flex items-center gap-4" data-testid="card-champion">
          <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-full sun-gradient flex items-center justify-center shrink-0 shadow-md">
            <Trophy className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Album Winner</div>
            <div className="font-display text-xl sm:text-2xl font-bold leading-tight truncate" style={{ fontFamily: "var(--font-display)" }}>{champion}</div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
        <div className="flex gap-4 sm:gap-6 min-w-max sm:min-w-0">
          {rounds.map(([round, list]) => (
            <div key={round} className="flex-1 min-w-[300px] sm:min-w-0">
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {dynamicRoundLabel(round, latestRound, latestRoundSize, prevRoundSize)}
                </div>
                {!readOnly && onDeleteRound && round === latestRound && (
                  <button
                    onClick={() => {
                      if (confirm(`Delete Round ${round}? Votes for this round will be removed.`)) onDeleteRound(round);
                    }}
                    className="text-muted-foreground hover:text-destructive transition-colors p-1 -m-1 rounded"
                    aria-label={`Delete round ${round}`}
                    data-testid={`button-delete-round-${round}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-3">
                {list.map(m => (
                  <MatchCard
                    key={m.id}
                    match={m}
                    players={players}
                    votes={votesByMatch.get(m.id) ?? []}
                    onCastVote={onCastVote}
                    readOnly={readOnly}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MatchCard({
  match, players, votes, onCastVote, readOnly,
}: {
  match: BracketMatch;
  players: Player[];
  votes: MatchVote[];
  onCastVote?: (matchId: number, playerId: number, song: string | null) => void;
  readOnly?: boolean;
}) {
  const totalVoted = votes.length;
  const totalPlayers = players.length;
  const tally = (song: string | null) => song ? votes.filter(v => v.songVotedFor === song).length : 0;
  const tallyA = tally(match.songA);
  const tallyB = tally(match.songB);
  const isComplete = !!match.winner;
  const isTie = !isComplete && totalVoted === totalPlayers && totalPlayers > 0 && tallyA === tallyB;

  return (
    <div
      className="rounded-lg border border-card-border bg-card overflow-hidden shadow-sm"
      data-testid={`match-${match.id}`}
    >
      <SlotRow
        song={match.songA}
        tally={tallyA}
        isWinner={!!match.winner && match.winner === match.songA}
        eliminated={!!match.winner && match.winner !== match.songA}
        voters={players.filter(p => votes.find(v => v.playerId === p.id && v.songVotedFor === match.songA))}
      />
      <div className="border-t border-border/60" />
      <SlotRow
        song={match.songB}
        tally={tallyB}
        isWinner={!!match.winner && match.winner === match.songB}
        eliminated={!!match.winner && match.winner !== match.songB}
        voters={players.filter(p => votes.find(v => v.playerId === p.id && v.songVotedFor === match.songB))}
      />

      {/* Voting strip */}
      {match.songA && match.songB && (
        <div className="border-t border-border/60 bg-muted/30 px-3 py-2.5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
              {isTie ? "Tie — break it manually" : isComplete ? "Decided" : `Votes ${totalVoted} / ${totalPlayers}`}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {players.map(p => {
              const v = votes.find(x => x.playerId === p.id);
              return (
                <PlayerVoteChip
                  key={p.id}
                  player={p}
                  votedFor={v?.songVotedFor ?? null}
                  songA={match.songA!}
                  songB={match.songB!}
                  readOnly={readOnly}
                  onCycle={(next) => onCastVote?.(match.id, p.id, next)}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function PlayerVoteChip({
  player, votedFor, songA, songB, onCycle, readOnly,
}: {
  player: Player;
  votedFor: string | null;
  songA: string;
  songB: string;
  onCycle: (next: string | null) => void;
  readOnly?: boolean;
}) {
  // Cycle: not voted → A → B → not voted
  function next() {
    if (votedFor === null) return songA;
    if (votedFor === songA) return songB;
    return null;
  }
  const isA = votedFor === songA;
  const isB = votedFor === songB;
  const noVote = !votedFor;

  return (
    <button
      disabled={readOnly}
      onClick={() => onCycle(next())}
      className={cn(
        "group flex items-center gap-1 rounded-full border pl-0.5 pr-2 py-0.5 transition-all min-w-0",
        readOnly ? "cursor-default" : "hover-elevate active-elevate cursor-pointer",
        noVote && "border-dashed border-muted-foreground/30 bg-background",
        !noVote && "border-transparent",
      )}
      style={{
        backgroundColor: noVote ? undefined : `${player.color}1f`, // 12% opacity
        borderColor: noVote ? undefined : player.color,
      }}
      data-testid={`vote-chip-${player.id}-${isA ? "a" : isB ? "b" : "none"}`}
      aria-label={`${player.name} ${noVote ? "no vote" : `voted for ${votedFor}`}`}
      title={noVote ? `${player.name}: tap to vote for ${songA}` : `${player.name}: voted for ${votedFor}`}
    >
      <PlayerAvatar player={player} sizeClass="h-5 w-5" textSizeClass="text-[10px]" />
      <span className="text-[10px] font-semibold leading-none whitespace-nowrap" style={{ color: noVote ? undefined : player.color }}>
        {noVote ? player.name : isA ? "A" : "B"}
      </span>
    </button>
  );
}

function SlotRow({
  song, tally, isWinner, eliminated, voters,
}: {
  song: string | null;
  tally: number;
  isWinner: boolean;
  eliminated: boolean;
  voters: Player[];
}) {
  if (!song) {
    return <div className="px-3 py-2.5 text-xs text-muted-foreground italic">— TBD —</div>;
  }
  return (
    <div
      className={cn(
        "px-3 py-2.5 flex items-center gap-2",
        isWinner && "bg-primary/15",
        eliminated && "opacity-50",
      )}
      data-testid={`slot-${song}`}
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full shrink-0",
          isWinner ? "bg-primary" : "bg-muted-foreground/30",
        )}
      />
      <span
        className={cn(
          "text-sm leading-tight flex-1 min-w-0 truncate",
          isWinner && "font-semibold",
          eliminated && "line-through",
        )}
      >
        {song}
      </span>
      {voters.length > 0 && (
        <div className="flex -space-x-1.5 shrink-0" aria-label={`Voted by ${voters.map(v => v.name).join(", ")}`}>
          {voters.map(v => (
            <PlayerAvatar
              key={v.id}
              player={v}
              sizeClass="h-6 w-6"
              textSizeClass="text-[10px]"
              className="ring-2 ring-card"
            />
          ))}
        </div>
      )}
      {tally > 0 && voters.length === 0 && (
        <span className={cn(
          "text-xs font-mono shrink-0 px-1.5 rounded",
          isWinner ? "bg-primary/20 text-primary" : "text-muted-foreground bg-muted",
        )}>{tally}</span>
      )}
      {isWinner && <Trophy className="h-3.5 w-3.5 text-primary shrink-0" />}
    </div>
  );
}
