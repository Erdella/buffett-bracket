import { cn } from "@/lib/utils";
import { assetUrl } from "@/lib/queryClient";

// Deterministic palette for OG member avatars (members have no stored color).
export const OG_COLORS = [
  "#01696F", "#C2410C", "#7C3AED", "#0F766E", "#B45309",
  "#1D4ED8", "#BE185D", "#15803D", "#9333EA", "#0891B2",
];

export function ogColor(id: number) {
  return OG_COLORS[id % OG_COLORS.length];
}

/**
 * Avatar for an OG community member: their uploaded photo if present, otherwise
 * a colored circle with the first letter of their display name. Members have no
 * stored color, so we derive a deterministic one from their id.
 */
export function MemberAvatar({
  name,
  id,
  photoUrl,
  sizeClass = "h-9 w-9",
  textSizeClass = "text-sm",
  className,
}: {
  name: string;
  id: number;
  photoUrl?: string | null;
  sizeClass?: string;
  textSizeClass?: string;
  className?: string;
}) {
  if (photoUrl) {
    return (
      <span
        className={cn("rounded-full overflow-hidden flex items-center justify-center shrink-0 bg-muted ring-1 ring-black/5", sizeClass, className)}
        title={name}
        aria-label={name}
      >
        <img src={assetUrl(photoUrl)} alt={name} className="h-full w-full object-cover" loading="lazy" />
      </span>
    );
  }
  return (
    <span
      className={cn("rounded-full overflow-hidden flex items-center justify-center shrink-0 font-semibold text-white", sizeClass, className)}
      style={{ backgroundColor: ogColor(id) }}
      title={name}
      aria-label={name}
    >
      <span className={cn("leading-none", textSizeClass)}>{name.charAt(0).toUpperCase()}</span>
    </span>
  );
}
