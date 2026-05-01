import type { Player } from "@/lib/types";
import { cn } from "@/lib/utils";
import { assetUrl } from "@/lib/queryClient";

interface Props {
  player: Pick<Player, "id" | "name" | "color" | "photoUrl">;
  /** Tailwind size classes for height/width, e.g. "h-7 w-7". */
  sizeClass?: string;
  /** Initial text size class. */
  textSizeClass?: string;
  className?: string;
  title?: string;
}

/**
 * Renders a player's profile photo if uploaded, otherwise a colored circle
 * with the first letter of their name. Used everywhere a player needs to be
 * identified in the UI (bracket votes, leaderboard, admin, album results).
 */
export function PlayerAvatar({
  player,
  sizeClass = "h-7 w-7",
  textSizeClass = "text-xs",
  className,
  title,
}: Props) {
  const initial = player.name.charAt(0).toUpperCase();
  const tip = title ?? player.name;
  const baseClass = cn(
    "rounded-full overflow-hidden flex items-center justify-center shrink-0",
    sizeClass,
    className,
  );
  if (player.photoUrl) {
    return (
      <span
        className={cn(baseClass, "ring-1 ring-black/5 bg-muted")}
        title={tip}
        aria-label={player.name}
      >
        <img
          src={assetUrl(player.photoUrl)}
          alt={player.name}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </span>
    );
  }
  return (
    <span
      className={cn(baseClass, "font-semibold text-white")}
      style={{ backgroundColor: player.color }}
      title={tip}
      aria-label={player.name}
    >
      <span className={cn("leading-none", textSizeClass)}>{initial}</span>
    </span>
  );
}
