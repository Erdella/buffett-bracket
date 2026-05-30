// ============================================================================
// Community bracket engine — SEEDED PLAY-IN model
// ----------------------------------------------------------------------------
// The community model: every member runs their OWN copy of an album's bracket.
// Round-1 pairings are identical for everyone (built from the album's SEED
// ORDER — see below). From the next round on, each member's bracket advances
// based on THEIR OWN picks, so two members can face entirely different matchups
// later.
//
// SEEDED PLAY-IN STRUCTURE (like the NCAA "First Four" -> Round of 64):
// A clean single-elimination bracket needs a power-of-two main field. When an
// album's song count N isn't a power of two, the LOWEST seeds play preliminary
// ("play-in") games; the winners join the TOP seeds in a full main round. There
// are NO byes when the math works out (which is essentially always for these
// album sizes). Concretely, given N seeded songs:
//
//   M            = largest power of two <= N        (main-bracket field size)
//   prelimGames  = N - M                            (play-in games)
//   directSeeds  = M - prelimGames                  (top seeds entering directly)
//
// The lowest 2*prelimGames seeds (seeds directSeeds+1 .. N) play prelims,
// paired strongest-vs-weakest. The top `directSeeds` seeds go straight into the
// main round. The main round is laid out in standard single-elimination seed
// order so seed 1 always faces the weakest opponent.
//
// Example — Down to Earth, 12 songs:
//   M=8, prelimGames=4, directSeeds=4.
//   Prelims (4 games): (5)v(12) (6)v(11) (7)v(10) (8)v(9).
//   Quarters (4 games): seeds 1-4 vs the four prelim winners. -> Semis -> Final.
//   Rounds: Preliminaries, Quarterfinals, Semifinals, Championship = 4 rounds.
//
// ROUND NUMBERING: when prelimGames > 0, the prelims are round 1 and the main
// bracket starts at round 2. When N is already a power of two there are no
// prelims and the main bracket starts at round 1.
//
// Album results are scored by WEIGHTED points across all members' picks:
//   - a pick in an early round (prelims / quarters)      = 1 point
//   - a pick in the semis (second-to-last round)         = 2 points
//   - a pick in the championship (last round)            = 4 points
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
  // Whether round 1 is a preliminary (play-in) round. When true, the main
  // bracket starts at round 2. Lets the UI label rounds correctly.
  hasPrelims: boolean;
}

/** Largest power of two <= n (the main-bracket field size). */
function largestPow2AtMost(n: number): number {
  let p = 1;
  while (p * 2 <= n) p *= 2;
  return p;
}

/**
 * Standard single-elimination seeding order for a bracket of `size` (a power of
 * two). Returns an array of seed numbers (1-based) in slot order, so that the
 * top seed meets the lowest seed, #2 meets the second-lowest, etc., and strong
 * seeds can't meet until late. e.g. size 8 -> [1,8,4,5,2,7,3,6].
 */
function seedSlots(size: number): number[] {
  let slots = [1, 2];
  while (slots.length < size) {
    const n = slots.length * 2;
    const next: number[] = [];
    for (const s of slots) {
      next.push(s);
      next.push(n + 1 - s);
    }
    slots = next;
  }
  return slots;
}

/**
 * A slot in the (power-of-two) main round. It's filled either by a song that
 * was seeded directly into the main bracket, or by the winner of one of the
 * preliminary play-in games.
 */
export type MainSlot =
  | { kind: "direct"; song: string }
  | { kind: "prelimWinner"; prelimIndex: number };

export interface SeededBracket {
  // Round-1 matchups shared by all members (prelims if any, else main round 1).
  roundOne: { songA: string | null; songB: string | null }[];
  // Total number of rounds the completed bracket will have.
  totalRounds: number;
  // True when roundOne is a preliminary play-in round.
  hasPrelims: boolean;
  // When hasPrelims is true, this describes how the FIRST main round (round 2)
  // is assembled: a flat list of slots in slot order, where consecutive pairs
  // (0,1), (2,3), ... form the main-round matchups. Each slot is either a
  // directly-seeded song or the winner of a specific prelim game. Empty when
  // there are no prelims (the main round is then just roundOne).
  mainSlots: MainSlot[];
}

/**
 * Build the shared, structurally-correct seeded play-in bracket from an ordered
 * list of songs by SEED (index 0 = seed 1 = strongest). Returns the round-1
 * pairings plus metadata. Round 1 is the prelims when N isn't a power of two;
 * otherwise round 1 is the (power-of-two) main round.
 */
export function buildSeededBracket(seedOrder: string[]): SeededBracket {
  const seeds = seedOrder.filter((s): s is string => !!s && s.trim().length > 0);
  const n = seeds.length;
  if (n === 0) return { roundOne: [], totalRounds: 0, hasPrelims: false, mainSlots: [] };
  if (n === 1)
    return { roundOne: [{ songA: seeds[0], songB: null }], totalRounds: 1, hasPrelims: false, mainSlots: [] };

  const song = (seed: number): string => seeds[seed - 1]; // seed is 1-based

  const M = largestPow2AtMost(n); // main field size
  const prelimGames = n - M; // play-in games
  const directSeeds = M - prelimGames; // top seeds entering main round directly

  const mainRounds = Math.round(Math.log2(M)); // rounds in the main bracket
  const hasPrelims = prelimGames > 0;
  const totalRounds = (hasPrelims ? 1 : 0) + mainRounds;

  if (!hasPrelims) {
    // N is a power of two: round 1 is the main round, paired in seed order.
    const order = seedSlots(M);
    const roundOne: { songA: string | null; songB: string | null }[] = [];
    for (let i = 0; i < order.length; i += 2) {
      roundOne.push({ songA: song(order[i]), songB: song(order[i + 1]) });
    }
    return { roundOne, totalRounds, hasPrelims, mainSlots: [] };
  }

  // Prelims: lowest 2*prelimGames seeds (directSeeds+1 .. n), strongest vs
  // weakest. P_k (k=1..prelimGames, 0-based index k-1) pairs seed
  // (directSeeds + k) against seed (n + 1 - k). The WINNER inherits the better
  // seed number (directSeeds + k) and takes that seed's slot in the main round.
  const roundOne: { songA: string | null; songB: string | null }[] = [];
  for (let k = 1; k <= prelimGames; k++) {
    const hi = directSeeds + k; // better (higher) seed
    const lo = n + 1 - k; // weaker (lower) seed
    roundOne.push({ songA: song(hi), songB: song(lo) });
  }

  // Main round (round 2): lay out the M-slot field in standard seed order.
  // Seeds 1..directSeeds are direct songs. Seeds directSeeds+1..M are filled by
  // the winner of prelim game (seed - directSeeds), i.e. 1-based prelim index.
  const order = seedSlots(M); // seed number per slot, length M
  const mainSlots: MainSlot[] = order.map(seed => {
    if (seed <= directSeeds) return { kind: "direct", song: song(seed) };
    return { kind: "prelimWinner", prelimIndex: seed - directSeeds - 1 }; // 0-based
  });

  return { roundOne, totalRounds, hasPrelims, mainSlots };
}

/**
 * Resolve an album's seed order. The seed order is the source of truth for the
 * seeded bracket. Preference:
 *   1. An explicit, admin-set seedOrder (JSON array of titles seed 1..N),
 *      filtered to titles that still exist on the album's tracklist, then any
 *      tracklist songs not present in the seed order appended in track order
 *      (so newly added tracks still appear, ranked last).
 *   2. Otherwise the album tracklist in listed (track) order.
 * `familyMatches` is accepted for signature compatibility but no longer used to
 * derive structure — seeds drive everything now.
 */
export function resolveSeedOrder(
  seedOrderJson: string | null | undefined,
  tracks: string[],
  _familyMatches?: BracketMatch[],
): string[] {
  const cleanTracks = tracks.filter((s): s is string => !!s && s.trim().length > 0);
  if (!seedOrderJson) return cleanTracks;

  let parsed: unknown;
  try {
    parsed = JSON.parse(seedOrderJson);
  } catch {
    return cleanTracks;
  }
  if (!Array.isArray(parsed)) return cleanTracks;

  const trackSet = new Set(cleanTracks);
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const t of parsed) {
    if (typeof t === "string" && trackSet.has(t) && !seen.has(t)) {
      ordered.push(t);
      seen.add(t);
    }
  }
  // Append any tracklist songs missing from the seed order, in track order.
  for (const t of cleanTracks) {
    if (!seen.has(t)) {
      ordered.push(t);
      seen.add(t);
    }
  }
  return ordered;
}

/**
 * Build the round-1 pairings (+ metadata) shared by all members for an album,
 * from its resolved seed order.
 */
export function buildRoundOne(
  seedOrderJson: string | null | undefined,
  tracks: string[],
  familyMatches?: BracketMatch[],
): SeededBracket {
  const seeds = resolveSeedOrder(seedOrderJson, tracks, familyMatches);
  return buildSeededBracket(seeds);
}

/**
 * Derive a single member's personal bracket from the shared seeded bracket plus
 * that member's own picks. Each round's matchups are computed from the member's
 * picks in the previous round (winners advance, paired by index). With the
 * seeded play-in model there are no byes — every round-1 slot is a real game,
 * and each subsequent round is a clean two-song matchup.
 */
export function derivePersonalBracket(
  seeded: SeededBracket,
  picks: CommunityBracketPick[],
): PersonalBracket {
  const { roundOne, totalRounds, hasPrelims, mainSlots } = seeded;

  const pickFor = (round: number, matchIndex: number): string | null =>
    picks.find(p => p.round === round && p.matchIndex === matchIndex)?.songPicked ?? null;

  const rounds: PersonalMatch[][] = [];

  // The "winner" carried forward for a match: an explicit pick, or the only
  // present song (defensive — a single-song matchup auto-advances).
  const winnerOf = (m: PersonalMatch): string | null => {
    if (m.pick) return m.pick;
    if (m.songA && !m.songB) return m.songA;
    if (m.songB && !m.songA) return m.songB;
    return null;
  };

  // Round 1 from the shared pairings (prelims when hasPrelims, else main round).
  let current: PersonalMatch[] = roundOne.map((pr, idx) => ({
    round: 1,
    matchIndex: idx,
    songA: pr.songA,
    songB: pr.songB,
    pick: pickFor(1, idx),
  }));
  rounds.push(current);

  let roundNum = 1;

  // Special transition: prelims (round 1) -> the full main round (round 2),
  // assembled from mainSlots. Direct-seed slots are fixed songs; prelim-winner
  // slots resolve to the member's prelim pick (null until they pick). The main
  // round is only formed once EVERY prelim game the main round depends on has a
  // winner — matching the all-or-nothing advance rule used for later rounds.
  if (hasPrelims && mainSlots.length > 0) {
    const prelimWinners = current.map(winnerOf);
    const resolveSlot = (slot: MainSlot): string | null =>
      slot.kind === "direct" ? slot.song : (prelimWinners[slot.prelimIndex] ?? null);

    // Need every prelim that feeds a slot to be decided before forming round 2.
    const neededPrelims = mainSlots
      .filter((s): s is { kind: "prelimWinner"; prelimIndex: number } => s.kind === "prelimWinner")
      .map(s => s.prelimIndex);
    const allPrelimsDecided = neededPrelims.every(pi => prelimWinners[pi] != null);

    if (allPrelimsDecided) {
      roundNum = 2;
      const next: PersonalMatch[] = [];
      for (let i = 0; i < mainSlots.length; i += 2) {
        const idx = next.length;
        next.push({
          round: 2,
          matchIndex: idx,
          songA: resolveSlot(mainSlots[i]),
          songB: resolveSlot(mainSlots[i + 1]),
          pick: pickFor(2, idx),
        });
      }
      rounds.push(next);
      current = next;
    } else {
      // Prelims not all decided yet — bracket stops at round 1.
      current = [] as PersonalMatch[];
    }
  }

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

  const finalRound = rounds[rounds.length - 1];
  const champion = finalRound.length === 1 ? winnerOf(finalRound[0]) : null;
  const complete = finalRound.length === 1 && champion != null;

  return {
    rounds,
    totalRounds,
    complete,
    champion,
    hasPrelims,
  };
}

/**
 * The point weight for a pick made in `round`, given the album bracket has
 * `totalRounds` rounds in total.
 *   championship (last round)        -> 4
 *   semis (second-to-last round)     -> 2
 *   everything earlier               -> 1
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
 * Compute the weighted album standings across ALL members' picks. Picks already
 * carry their round, so we weight directly from the pick rows. `totalRounds`
 * comes from the shared seeded bracket.
 */
export function computeStandings(
  totalRounds: number,
  allPicks: CommunityBracketPick[],
): { totalRounds: number; ranked: StandingRow[]; winner: string | null; voterCount: number } {
  // song -> round -> votes
  const bySong: Record<string, Record<number, number>> = {};
  const voters = new Set<number>();
  for (const p of allPicks) {
    voters.add(p.memberId);
    if (!bySong[p.songPicked]) bySong[p.songPicked] = {};
    bySong[p.songPicked][p.round] = (bySong[p.songPicked][p.round] ?? 0) + 1;
  }

  const ranked: StandingRow[] = Object.entries(bySong).map(([songTitle, roundsMap]) => {
    const breakdown = Object.entries(roundsMap)
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

  let winner: string | null = null;
  if (ranked.length > 0) {
    const top = ranked[0];
    winner = top.points > 0 ? top.songTitle : null;
  }

  return { totalRounds, ranked, winner, voterCount: voters.size };
}
