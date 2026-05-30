// ============================================================================
// Community bracket engine
// ----------------------------------------------------------------------------
// The community model: every member runs their OWN copy of an album's bracket.
// Round 1 pairings are identical for everyone (taken from the family bracket's
// round-1 matches, or auto-generated from the album tracklist if no family
// bracket exists). From round 2 on, each member's bracket advances based on
// THEIR OWN picks — so two members can face entirely different matchups later.
//
// Album results are scored by WEIGHTED points across all members' picks:
//   - a pick in an early round (prelims / quarters)      = 1 point
//   - a pick in the semis (second-to-last round)         = 2 points
//   - a pick in the championship (last/final round)      = 4 points
// The album's community winner is the song with the most points. Ties are
// listed alphabetically.
// ============================================================================

import type { BracketMatch, CommunityBracketPick } from "@shared/schema";

export interface PersonalMatch {
  round: number;
  matchIndex: number;
  songA: string | null;
  songB: string | null;
  // The song this member picked in this matchup (null if not yet picked).
  pick: string | null;
}

export interface PersonalBracket {
  rounds: PersonalMatch[][]; // rounds[0] = round 1, etc.
  totalRounds: number;
  complete: boolean; // member has picked a champion (final round decided)
  champion: string | null;
}

/**
 * Build the round-1 pairings shared by all members for an album.
 *
 * Preference order:
 *   1. The family bracket's round-1 matches (songA/songB) — keeps community and
 *      family starting from an identical bracket.
 *   2. If no family round 1 exists, auto-pair the album tracklist in listed
 *      order (1v2, 3v4, ...). An odd final track gets a bye (songB = null).
 */
export function buildRoundOne(
  familyMatches: BracketMatch[],
  tracks: string[],
): { songA: string | null; songB: string | null }[] {
  const familyR1 = familyMatches
    .filter(m => m.round === 1)
    .sort((a, b) => a.matchIndex - b.matchIndex);
  if (familyR1.length > 0) {
    return familyR1.map(m => ({ songA: m.songA, songB: m.songB }));
  }
  // Auto-generate from tracklist.
  const pairs: { songA: string | null; songB: string | null }[] = [];
  for (let i = 0; i < tracks.length; i += 2) {
    pairs.push({ songA: tracks[i] ?? null, songB: tracks[i + 1] ?? null });
  }
  return pairs;
}

/**
 * Derive a single member's personal bracket from the shared round-1 pairings
 * plus that member's own picks. Each round's matchups are computed from the
 * member's picks in the previous round (winners advance, paired by index).
 *
 * A match with a bye (one song null) auto-advances the present song as the
 * effective "feeder" so the next round can still form — but we do NOT record a
 * pick for byes; the present song simply carries forward.
 */
export function derivePersonalBracket(
  roundOne: { songA: string | null; songB: string | null }[],
  picks: CommunityBracketPick[],
): PersonalBracket {
  const pickFor = (round: number, matchIndex: number): string | null =>
    picks.find(p => p.round === round && p.matchIndex === matchIndex)?.songPicked ?? null;

  const rounds: PersonalMatch[][] = [];

  // Round 1 from the shared pairings.
  let current: PersonalMatch[] = roundOne.map((pr, idx) => ({
    round: 1,
    matchIndex: idx,
    songA: pr.songA,
    songB: pr.songB,
    pick: pickFor(1, idx),
  }));
  rounds.push(current);

  // The "winner" carried forward for a match: an explicit pick, or the only
  // present song when the other side is a bye.
  const winnerOf = (m: PersonalMatch): string | null => {
    if (m.pick) return m.pick;
    if (m.songA && !m.songB) return m.songA;
    if (m.songB && !m.songA) return m.songB;
    return null;
  };

  let roundNum = 1;
  // Keep building rounds while the current round narrows toward a single match
  // AND every match in the current round has a resolved winner (pick or bye).
  while (current.length > 1) {
    const winners = current.map(winnerOf);
    // If any match in the current round is unresolved, the next round can't be
    // fully formed yet — stop here. The member still needs to pick.
    if (winners.some(w => w == null)) break;

    roundNum += 1;
    const next: PersonalMatch[] = [];
    for (let i = 0; i < winners.length; i += 2) {
      const songA = winners[i] ?? null;
      const songB = winners[i + 1] ?? null;
      const idx = next.length;
      next.push({
        round: roundNum,
        matchIndex: idx,
        songA,
        songB,
        pick: pickFor(roundNum, idx),
      });
    }
    rounds.push(next);
    current = next;
  }

  // totalRounds is the number of rounds the FULL bracket will have once
  // completed. The matchup count halves each round starting from
  // roundOne.length; simulate the halving so weighting stays consistent
  // regardless of how far this member has progressed.
  const computedTotalRounds = (() => {
    let n = roundOne.length;
    let r = 1;
    while (n > 1) { n = Math.ceil(n / 2); r += 1; }
    return r;
  })();

  const finalRound = rounds[rounds.length - 1];
  const champion = finalRound.length === 1 ? winnerOf(finalRound[0]) : null;
  const complete = finalRound.length === 1 && champion != null;

  return {
    rounds,
    totalRounds: computedTotalRounds,
    complete,
    champion,
  };
}

/**
 * The point weight for a pick made in `round`, given the album bracket has
 * `totalRounds` rounds in total.
 *   championship (last round)        -> 4
 *   semis (second-to-last round)     -> 2
 *   everything earlier               -> 1
 * For tiny brackets (1-2 rounds) we still honor the championship = 4 / semis = 2
 * mapping relative to the last round.
 */
export function weightForRound(round: number, totalRounds: number): number {
  if (round === totalRounds) return 4; // championship
  if (round === totalRounds - 1) return 2; // semis
  return 1; // prelims / quarters / earlier
}

export interface StandingRow {
  songTitle: string;
  points: number;
  votes: number; // raw number of member picks (any round) for this song
  breakdown: { round: number; weight: number; votes: number; points: number }[];
}

/**
 * Compute the weighted album standings across ALL members' picks. We need each
 * member's personal bracket to know which round a pick sat in (for weighting),
 * but since picks already carry their round, we can weight directly from the
 * pick rows. `totalRounds` is derived from the shared round-1 pairing count.
 */
export function computeStandings(
  roundOneLength: number,
  allPicks: CommunityBracketPick[],
): { totalRounds: number; ranked: StandingRow[]; winner: string | null; voterCount: number } {
  const totalRounds = (() => {
    let n = roundOneLength;
    let r = 1;
    while (n > 1) { n = Math.ceil(n / 2); r += 1; }
    return r;
  })();

  // song -> round -> votes
  const bySong: Record<string, Record<number, number>> = {};
  const voters = new Set<number>();
  for (const p of allPicks) {
    voters.add(p.memberId);
    if (!bySong[p.songPicked]) bySong[p.songPicked] = {};
    bySong[p.songPicked][p.round] = (bySong[p.songPicked][p.round] ?? 0) + 1;
  }

  const ranked: StandingRow[] = Object.entries(bySong).map(([songTitle, rounds]) => {
    const breakdown = Object.entries(rounds)
      .map(([rStr, votes]) => {
        const round = Number(rStr);
        const weight = weightForRound(round, totalRounds);
        return { round, weight, votes, points: weight * votes };
      })
      .sort((a, b) => a.round - b.round);
    const points = breakdown.reduce((s, b) => s + b.points, 0);
    const votes = breakdown.reduce((s, b) => s + b.votes, 0);
    return { songTitle, points, votes, breakdown };
  });

  // Sort by points desc, then alphabetically (ties broken alphabetically).
  ranked.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return a.songTitle.localeCompare(b.songTitle);
  });

  // Winner = top of the ranked list, but only if there are any picks at all.
  // If the top two are tied on points, there is no single winner — the user's
  // rule lists ties alphabetically, so the alphabetically-first is shown first
  // but we flag a true tie by leaving `winner` as the alpha-first only when it
  // strictly leads. We expose the leader regardless; a tie just means several
  // share the top points.
  let winner: string | null = null;
  if (ranked.length > 0) {
    const top = ranked[0];
    winner = top.points > 0 ? top.songTitle : null;
  }

  return { totalRounds, ranked, winner, voterCount: voters.size };
}
