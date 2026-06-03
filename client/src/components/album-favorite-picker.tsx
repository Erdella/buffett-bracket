import { useMutation, useQuery } from "@tanstack/react-query";
import type { Album, CommunityFavoritesData } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Heart, Star, Users, Music } from "lucide-react";
import { AvatarStack } from "@/components/avatar-stack";

/**
 * Lets a logged-in community member pick their single favorite song from an
 * album, and shows the community's aggregated favorites ranking for that album.
 * The picker is a tap-to-select list of every track. The current pick is
 * highlighted with a filled heart. Tapping a different track changes the pick.
 */
export function AlbumFavoritePicker({ album }: { album: Album }) {
  const { member } = useAuth();
  const { toast } = useToast();

  const favorites = useQuery<CommunityFavoritesData>({
    queryKey: ["/api/albums", album.id, "community-favorites"],
    refetchInterval: 30_000,
  });

  const favMutation = useMutation({
    mutationFn: async (songTitle: string) => {
      const res = await apiRequest("POST", "/api/community/favorite", {
        albumId: album.id,
        songTitle,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/albums", album.id, "community-favorites"] });
      toast({ title: "Favorite saved", description: "Your pick for this album is locked in. Fins up. 🌴" });
    },
    onError: (err: Error) => {
      toast({
        title: "Couldn't save your favorite",
        description: err.message.replace(/^\d+:\s*/, ""),
        variant: "destructive",
      });
    },
  });

  if (!favorites.data) {
    return <div className="h-48 rounded-xl bg-muted animate-pulse" />;
  }

  const { ranked, total, myFavorite } = favorites.data;
  const rankFor = (song: string) => ranked.find(r => r.songTitle === song);
  const countFor = (song: string) => rankFor(song)?.count ?? 0;
  const topCount = ranked[0]?.count ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Music className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-display text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>Tracklist</h3>
        </div>
        <Badge variant="secondary" className="gap-1 text-[11px]">
          <Users className="h-3 w-3" /> {total} {total === 1 ? "pick" : "picks"}
        </Badge>
      </div>

      {!member ? (
        <Card className="bg-primary/5 border-primary/30">
          <CardContent className="py-4 flex items-center gap-3">
            <Star className="h-5 w-5 text-primary shrink-0" />
            <p className="text-sm">
              <strong>Sign in</strong> to tap a track and mark your favorite song from this album — and
              see how it stacks up against the rest of the crew.
            </p>
          </CardContent>
        </Card>
      ) : (
        <p className="text-xs text-muted-foreground">
          Tap a track to set it as your favorite from <strong className="text-foreground">{album.title}</strong>.
          {myFavorite && <> Your current pick: <strong className="text-foreground">{myFavorite}</strong>.</>}
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
            const pick = () => { if (member && !favMutation.isPending) favMutation.mutate(track); };
            return (
              <div
                key={i}
                role="button"
                tabIndex={member ? 0 : -1}
                onClick={pick}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
                    e.preventDefault();
                    pick();
                  }
                }}
                aria-pressed={isMine}
                aria-disabled={!member || favMutation.isPending}
                data-testid={`favorite-track-${album.id}-${i}`}
                className={cn(
                  "relative w-full text-left px-4 py-3 flex flex-col gap-2 text-sm overflow-hidden transition-colors",
                  isMine && "bg-primary/10",
                  member ? "hover-elevate active-elevate cursor-pointer" : "cursor-default",
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
