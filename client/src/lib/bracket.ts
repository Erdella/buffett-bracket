import type { BracketMatch } from "./types";

/**
 * Group matches by round, sorted by matchIndex within each round.
 */
export function groupByRound(matches: BracketMatch[]): [number, BracketMatch[]][] {
  const map = new Map<number, BracketMatch[]>();
  for (const m of matches) {
    const list = map.get(m.round);
    if (list) list.push(m);
    else map.set(m.round, [m]);
  }
  for (const list of Array.from(map.values())) list.sort((a, b) => a.matchIndex - b.matchIndex);
  return Array.from(map.entries()).sort(([a], [b]) => a - b);
}

/**
 * Label a round given how many matches are in the latest round.
 * If the latest round has 1 match, it's the Final; 2 → Semifinal; 4 → Quarterfinal.
 * Earlier rounds use "Round N".
 *
 * `prevRoundSize` (the round before `latestRound`) disambiguates a 1-match
 * round: a true Final follows a 2-match Semifinal. A 1-match round whose
 * predecessor wasn't a 2-match round is a prelim play-in (e.g. a 9-song
 * album where Round 1 has a single 8-vs-9 matchup).
 */
export function dynamicRoundLabel(
  round: number,
  latestRound: number,
  latestRoundSize: number,
  prevRoundSize: number = 0,
): string {
  const latestIsFinal = latestRoundSize === 1 && prevRoundSize === 2;
  const latestIsPrelim = latestRoundSize === 1 && !latestIsFinal;
  if (round === latestRound) {
    if (latestIsPrelim) return "Prelim";
    if (latestRoundSize === 1) return "Final";
    if (latestRoundSize === 2) return "Semifinal";
    if (latestRoundSize === 4) return "Quarterfinal";
  } else if (latestIsFinal) {
    // Past rounds when we know the latest is a true Final: count back with
    // size doubling (Final → Semifinal → Quarterfinal…).
    const offset = latestRound - round;
    const sizeAtRound = latestRoundSize * Math.pow(2, offset);
    if (sizeAtRound === 1) return "Final";
    if (sizeAtRound === 2) return "Semifinal";
    if (sizeAtRound === 4) return "Quarterfinal";
  }
  return `Round ${round}`;
}

/**
 * Get the list of decided winners from a specific round, in matchIndex order.
 * Useful for showing the user which songs advanced and prompting the next round.
 */
export function winnersOfRound(matches: BracketMatch[], round: number): string[] {
  return matches
    .filter(m => m.round === round && m.winner)
    .sort((a, b) => a.matchIndex - b.matchIndex)
    .map(m => m.winner as string);
}

/**
 * Returns true if every match in the given round has a decided winner.
 */
export function isRoundComplete(matches: BracketMatch[], round: number): boolean {
  const rms = matches.filter(m => m.round === round);
  return rms.length > 0 && rms.every(m => !!m.winner);
}

/**
 * Returns true if every match in the round has been fully voted by every player
 * with a clear majority winner. Since the server only sets `winner` once all
 * players have voted AND there is a non-tie majority, checking that every match
 * has a non-null winner is equivalent to "all players voted, no ties".
 */
export function isRoundFullyVoted(matches: BracketMatch[], round: number, totalPlayers: number): boolean {
  const rms = matches.filter(m => m.round === round);
  if (rms.length === 0 || totalPlayers === 0) return false;
  return rms.every(m => !!m.winner);
}

export type ParsedMatchup = { songA: string; songB: string };
export type ParseResult =
  | { ok: true; matchups: ParsedMatchup[] }
  | { ok: false; error: string };

/**
 * Parse a pasted block of matchups. Each non-empty line should contain two song
 * titles separated by " vs ", " VS ", " v ", or " | ". Surrounding numbering
 * like "1. " or "Match 3: " is stripped. Quotes around titles are stripped.
 *
 * If `tracks` is provided, each parsed title is fuzzy-matched to the closest
 * track and replaced with the canonical title. An error is returned if any
 * title can't be matched.
 *
 * If `allowedSongs` is provided (e.g. winners of the previous round), parsed
 * titles must match one of those.
 */
export function parseMatchups(
  raw: string,
  opts: { tracks?: string[]; allowedSongs?: string[] } = {},
): ParseResult {
  const lines = raw
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);
  if (lines.length === 0) return { ok: false, error: "No matchups found." };

  const matchups: ParsedMatchup[] = [];
  for (const rawLine of lines) {
    // Strip leading "1.", "1)", "Match 1:", "- ", "• " etc.
    const cleaned = rawLine
      .replace(/^\s*(?:match\s*\d+\s*[:\-\.]?|\d+\s*[\).\-:]|[-•*])\s*/i, "")
      .trim();
    // Split on " vs ", " v ", " | ", " — "
    const parts = cleaned.split(/\s+(?:vs\.?|v\.?|\||—|–)\s+/i);
    if (parts.length !== 2) {
      return { ok: false, error: `Couldn't parse line: "${rawLine}". Use the format "Song A vs Song B".` };
    }
    let [a, b] = parts.map(s => stripQuotes(s).trim());
    if (!a || !b) return { ok: false, error: `Empty side on line: "${rawLine}".` };
    if (opts.tracks) {
      const ma = matchTrack(a, opts.tracks);
      const mb = matchTrack(b, opts.tracks);
      if (!ma) return { ok: false, error: `Couldn't find a track matching "${a}".` };
      if (!mb) return { ok: false, error: `Couldn't find a track matching "${b}".` };
      a = ma; b = mb;
    }
    if (opts.allowedSongs) {
      if (!opts.allowedSongs.includes(a)) {
        return { ok: false, error: `"${a}" wasn't a winner of the previous round.` };
      }
      if (!opts.allowedSongs.includes(b)) {
        return { ok: false, error: `"${b}" wasn't a winner of the previous round.` };
      }
    }
    if (a === b) return { ok: false, error: `Both sides of a matchup are the same song: "${a}".` };
    matchups.push({ songA: a, songB: b });
  }

  // No duplicate songs across matchups
  const seen = new Set<string>();
  for (const mu of matchups) {
    for (const s of [mu.songA, mu.songB]) {
      if (seen.has(s)) return { ok: false, error: `"${s}" appears in more than one matchup.` };
      seen.add(s);
    }
  }
  return { ok: true, matchups };
}

function stripQuotes(s: string): string {
  return s.replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "");
}

/** Normalise a string for fuzzy comparison — lowercase, strip punctuation/whitespace. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u2018\u2019\u201C\u201D'"`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function matchTrack(input: string, tracks: string[]): string | null {
  const ni = normalize(input);
  // Exact normalized match first
  for (const t of tracks) if (normalize(t) === ni) return t;
  // Prefix match
  for (const t of tracks) if (normalize(t).startsWith(ni) || ni.startsWith(normalize(t))) return t;
  // Substring
  for (const t of tracks) if (normalize(t).includes(ni) || ni.includes(normalize(t))) return t;
  return null;
}
