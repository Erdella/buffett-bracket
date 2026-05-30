// ============================================================================
// Community bracket engine
// ----------------------------------------------------------------------------
// The community model: every member runs their OWN copy of an album's bracket.
// Round 1 pairings are identical for everyone (derived from the same songs the
// family bracket uses, or auto-generated from the album tracklist if no family
// bracket exists). From round 2 on, each member's bracket advances based on
// THEIR OWN picks — so two members can face entirely different matchups later.
//
// BYES: A real single-elimination bracket needs a power-of-two field. When the
// number of songs isn't a power of two, some songs get a "bye" — a free pass.
// Byes ALWAYS live in round 1 (the preliminaries): a bye song skips round 1 and
// enters directly in round 2. This keeps round 2 onward a clean power-of-two
// bracket with NO stray byes in the quarterfinals/semifinals/championship.
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
  // Songs that received a round-1 bye (auto-advance straight into round 2).
  byes: string[];
}

/** Smallest power of two >= n. This is the full bracket size B. */
function smallestPow2AtLeast(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Build a structurally-correct round-1 from a flat, ordered list of songs,
 * placing all byes in round 1 so that round 2 onward is a clean power-of-two
 * bracket.
 *
 * Given N songs:
 *   B     = smallest power of two >= N      (full bracket size)
 *   byes  = B - N                           (songs that skip round 1)
 *   games = N - B/2                          (real round-1 matchups)
 *   After round 1, exactly B/2 songs advance (a power of two).
 *
 * Byes are spread as evenly as possible across the round-1 slots (rather than
 * clumped at the front) so the bracket stays balanced.
 */
export function buildRoundOneFromSongs(
  songs: string[],
): { songA: string | null; songB: string | null }[] {
  const clean = songs.filter((s): s is string => !!s && s.trim().length > 0);
  const n = clean.length;
  if (n === 0) return [];
  if (n === 1) return [{ songA: clean[0], songB: null }];

  const B = smallestPow2AtLeast(n);
  const byes = B - n;
  const totalSlots = B / 2; // each round-1 slot yields one round-2 entrant

  // Decide which of the `totalSlots` slots are byes — spread evenly.
  const isBye = new Array<boolean>(totalSlots).fill(false);
  if (byes > 0) {
    for (let k = 0; k < byes; k++) {
      const pos = Math.min(
        totalSlots - 1,
        Math.floor((k + 0.5) * (totalSlots / byes)),
      );
      isBye[pos] = true;
    }
    // Correct any rounding collisions so exactly `byes` slots are flagged.
    let flagged = isBye.filter(Boolean).length;
    for (let i = 0; flagged < byes && i < totalSlots; i++) {
      if (!isBye[i]) { isBye[i] = true; flagged++; }
    }
    for (let i = totalSlots - 1; flagged > byes && i >= 0; i--) {
      if (isBye[i]) { isBye[i] = false; flagged--; }
    }
  }

  // Walk songs in order, filling slots: a bye consumes 1 song, a game 2.
  const matches: { songA: string | null; songB: string | null }[] = [];
  let s = 0;
  for (let slot = 0; slot < totalSlots; slot++) {
    if (isBye[slot]) {
      matches.push({ songA: clean[s++] ?? null, songB: null });
    } else {
      matches.push({ songA: clean[s++] ?? null, songB: clean[s++] ?? null });
    }
  }
  return matches;
}

/**
 * Build the round-1 pairings shared by all members for an album.
 *
 * Preference order:
 *   1. The songs in the family bracket's round-1 matches — keeps the community
 *      competing over the same songs the family did. We re-seed those songs
 *      through buildRoundOneFromSongs so the structure (and bye placement) is
 *      always valid even if the family's round 1 wasn't a power of two.
 *   2. If no family round 1 exists, seed from the album tracklist in listed
 *      order.
 */
export function buildRoundOne(
  familyMatches: BracketMatch[],
  tracks: string[],
): { songA: string | null; songB: string | null }[] {
  const familyR1 = familyMatches
    .filter(m => m.round === 1)
    .sort((a, b) => a.matchIndex - b.matchIndex);

  if (familyR1.length > 0) {
    // Collect the participating songs in match/slot order (songA then songB).
    const songs: string[] = [];
    for (const m of familyR1) {
      if (m.songA) songs.push(m.songA);
      if (m.songB) songs.push(m.songB);
    }
    return buildRoundOneFromSongs(songs);
  }

  // Auto-generate from the tracklist.
  return buildRoundOneFromSongs(tracks);
}

/** The list of songs receiving a round-1 bye, in bracket order. */
export function byeSongsOf(
  roundOne: { songA: string | null; songB: string | null }[],
): string[] {
  return roundOne
    .filter(m => (m.songA && !m.songB) || (m.songB && !m.songA))
    .map(m => (m.songA || m.songB) as string);
}

/**
 * Derive a single member's personal bracket from the shared round-1 pairings
 * plus that member's own picks. Each round's matchups are computed from the
 * member's picks in the previous round (winners advance, paired by index).
 *
 * A round-1 bye (one song null) auto-advances the present song into round 2 —
 * we do NOT record a pick for byes; the song simply carries forward. Because
 * byes only ever appear in round 1, every later round is a clean two-song
 * matchup.
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
  // completed. With byes correctly placed in round 1, the matchup count halves
  // exactly each round from roundOne.length down to 1.
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
    byes: byeSongsOf(roundOne),
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
  let winner: string | null = null;
  if (ranked.length > 0) {
    const top = ranked[0];
    winner = top.points > 0 ? top.songTitle : null;
  }

  return { totalRounds, ranked, winner, voterCount: voters.size };
}
