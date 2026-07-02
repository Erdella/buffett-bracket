import type { TierGrade } from "@/lib/types";

/**
 * Shared visual styling for tier grades (S best -> F worst), matching the
 * classic tier-maker palette: S red, A orange, B gold, C yellow, D light green,
 * F green. Used by the album rating control, the personal tier list, and the
 * Results community-average badge so grades look identical everywhere.
 */
export const TIER_STYLE: Record<TierGrade, {
  /** Solid row/label background. */
  bg: string;
  /** Text color that reads on top of `bg`. */
  text: string;
  /** Full label class (bg + text + weight) for a filled chip/row-label. */
  chip: string;
  label: string;
}> = {
  S: { bg: "bg-[#ff7f7f]", text: "text-[#3a0d0d]", chip: "bg-[#ff7f7f] text-[#3a0d0d]", label: "S" },
  A: { bg: "bg-[#ffbf7f]", text: "text-[#3a220d]", chip: "bg-[#ffbf7f] text-[#3a220d]", label: "A" },
  B: { bg: "bg-[#ffdf7f]", text: "text-[#3a300d]", chip: "bg-[#ffdf7f] text-[#3a300d]", label: "B" },
  C: { bg: "bg-[#ffff7f]", text: "text-[#3a3a0d]", chip: "bg-[#ffff7f] text-[#3a3a0d]", label: "C" },
  D: { bg: "bg-[#bfff7f]", text: "text-[#243a0d]", chip: "bg-[#bfff7f] text-[#243a0d]", label: "D" },
  F: { bg: "bg-[#7fff7f]", text: "text-[#0d3a0d]", chip: "bg-[#7fff7f] text-[#0d3a0d]", label: "F" },
};

export const TIER_DESCRIPTION: Record<TierGrade, string> = {
  S: "Top tier — a cut above the best",
  A: "Excellent",
  B: "Good",
  C: "Okay",
  D: "Below average",
  F: "Skip it",
};
