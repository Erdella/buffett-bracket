import type { Album } from "@/lib/types";
import { cn } from "@/lib/utils";
import { assetUrl } from "@/lib/queryClient";
import { Disc3 } from "lucide-react";

interface Props {
  album: Pick<Album, "title" | "coverUrl">;
  /** Tailwind size class applied to the square — e.g. "h-14 w-14", "h-32 w-32". */
  sizeClass?: string;
  /** Tailwind border radius. Defaults to "rounded-md". */
  roundedClass?: string;
  className?: string;
}

/**
 * Album cover artwork with a graceful placeholder when no image has been
 * uploaded yet. Always square; uses object-cover so non-square uploads still
 * fill the frame nicely.
 */
export function AlbumCover({
  album,
  sizeClass = "h-14 w-14",
  roundedClass = "rounded-md",
  className,
}: Props) {
  const base = cn(
    "shrink-0 overflow-hidden bg-muted ring-1 ring-black/5 shadow-sm",
    sizeClass,
    roundedClass,
    className,
  );
  if (album.coverUrl) {
    return (
      <div className={base} aria-label={`${album.title} cover art`}>
        <img
          src={assetUrl(album.coverUrl)}
          alt={`${album.title} cover`}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
    );
  }
  return (
    <div
      className={cn(base, "flex items-center justify-center bg-gradient-to-br from-muted to-muted/40")}
      aria-label={`${album.title} cover placeholder`}
    >
      <Disc3 className="h-1/2 w-1/2 text-muted-foreground/40" />
    </div>
  );
}
