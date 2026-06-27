import { useQuery } from "@tanstack/react-query";
import type { Album, CommunityFavoritesData } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Heart, Star, Users, Music, Trophy } from "lucide-react";
import { AvatarStack } from "@/components/avatar-stack";

/**
 * Shows the album tracklist alongside the community's favorites. A member's
 * favorite is no longer picked separately — it is DERIVED from their bracket:
 * whatever song they crown as the album champion is their favorite. This list
 * is read-only; voting happens in the bracket above. Each track shows who
 * crowned it (avatars) and how many members did.
 */
export function AlbumFavoritePicker({ album }: { album: Album }) {
  const { member } = useAuth();

  const favorites = useQuery<CommunityFavoritesData>({
    queryKey: ["/api/albums", album.id, "community-favorites"],
    refetchInterval: 30_000,
  });

  if (!favorites.data) {
    return <div className="h-48 rounded-xl bg-muted animate-pulse" />;
  }

  const { ranked, total, myFavorite } = favorites.data;
  const rankFor = (song: string) => ranked.find(r => r.songTitle === song);
  const topCount = ranked[0]?.count ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Music className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-display text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>Tracklist</h3>
        </div>
        <Badge variant="secondary" className="gap-1 text-[11px]">
          <Users className="h-3 w-3" /> {total} {total === 1 ? "favorite" : "favorites"}
        </Badge>
      </div>

      {!member ? (
        <Card className="bg-primary/5 border-primary/30">
          <CardContent className="py-4 flex items-center gap-3">
            <Trophy className="h-5 w-5 text-primary shrink-0" />
            <p className="text-sm">
              <strong>Sign in</strong> and fill out your bracket — the song you crown as the album
              champion becomes your favorite, and you'll see how it stacks up against the crew.
            </p>
          </CardContent>
        </Card>
      ) : (
        <p className="text-xs text-muted-foreground">
          Your favorite from <strong className="text-foreground">{album.title}</strong> is whoever you
          crown in your bracket above.
          {myFavorite
            ? <> Right now that's <strong className="text-foreground">{myFavorite}</strong>.</>
            : <> Finish your bracket to lock it in.</>}
        </p>
      )}

      <Card className="border-card-border">
        <CardContent className="p-0 divide-y divide-border/60">
          {album.tracks.map((track, i) => {
            const rank = rankFor(track);
            const count = rank?.count ?? 0;
            const voters = rank?.voters ?? [];
            const isMine = myFavorite === track;
            const isTop = count > 0 && count === topCount;
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <div
                key={i}
                data-testid={`favorite-track-${album.id}-${i}`}
                className={cn(
                  "relative w-full text-left px-4 py-3 flex flex-col gap-2 text-sm overflow-hidden",
                  isMine && "bg-primary/10",
                )}
              >
                {/* Subtle popularity fill */}
                {count > 0 && (
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 bg-primary/10"
                    style={{ width: `${pct}%` }}
                  />
                )}
                <div className="relative flex items-center gap-3">
                  <span className="text-xs text-muted-foreground font-mono w-6 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                  <Heart
                    className={cn(
                      "h-4 w-4 shrink-0",
                      isMine ? "fill-primary text-primary" : "text-muted-foreground/40",
                    )}
                  />
                  <span className="flex-1 truncate min-w-0">{track}</span>
                  {isTop && (
                    <Badge className="bg-primary/15 text-primary border-0 text-[10px] gap-1 shrink-0">
                      <Star className="h-3 w-3" /> Crowd favorite
                    </Badge>
                  )}
                  {/* Voter avatars sit on the right, next to the pick count /
                      Crowd favorite badge, instead of on their own line. */}
                  {voters.length > 0 && (
                    <AvatarStack
                      voters={voters}
                      max={10}
                      testId={`favorite-voters-${album.id}-${i}`}
                    />
                  )}
                  {count > 0 && (
                    <span
                      className="text-xs tabular-nums text-muted-foreground shrink-0 w-5 text-right"
                      data-testid={`favorite-count-${album.id}-${i}`}
                    >
                      {count}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
