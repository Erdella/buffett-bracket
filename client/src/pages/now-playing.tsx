import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Album, AlbumStatus, Settings } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlbumBracketEditor } from "@/components/album-bracket-editor";
import { AlbumCover } from "@/components/album-cover";
import { CommunityVoting } from "@/components/community-voting";
import { AlbumFavoritePicker } from "@/components/album-favorite-picker";
import { Music, ArrowRight, Sparkles, Users } from "lucide-react";

export default function NowPlaying() {
  const settings = useQuery<Settings>({ queryKey: ["/api/settings"] });
  const albums = useQuery<Album[]>({ queryKey: ["/api/albums"] });

  const currentId = settings.data?.currentAlbumId ?? null;
  const currentAlbum = albums.data?.find(a => a.id === currentId) ?? null;

  const status = useQuery<AlbumStatus | null>({
    queryKey: ["/api/albums", currentId, "status"],
    enabled: !!currentId,
  });

  if (!settings.data) return <SkeletonPage />;

  if (!currentAlbum) {
    return (
      <div className="space-y-6">
        <Hero />
        <Card className="border-dashed border-2">
          <CardContent className="py-10 sm:py-14 text-center space-y-4">
            <div className="mx-auto h-14 w-14 rounded-full bg-primary/15 flex items-center justify-center">
              <Music className="h-6 w-6 text-primary" />
            </div>
            <div>
              <div className="font-display text-xl font-bold mb-1" style={{ fontFamily: "var(--font-display)" }}>No album in play yet</div>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Pick the first album from the admin panel, then paste this round's matchups to start the family bracket.
              </p>
            </div>
            <Button asChild data-testid="button-go-admin">
              <Link href="/admin">Open Admin <ArrowRight className="h-4 w-4 ml-1.5" /></Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isComplete = status.data?.status === "completed";

  return (
    <div className="space-y-6 sm:space-y-8">
      <Card className="overflow-hidden border-card-border">
        <div className="sun-gradient h-2 w-full" />
        <CardContent className="p-5 sm:p-7">
          <div className="flex gap-5 sm:gap-7 items-start">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
                  <Sparkles className="h-3 w-3 mr-1" /> Now Playing
                </Badge>
                {isComplete && <Badge className="bg-primary text-primary-foreground">Completed</Badge>}
              </div>
              <h1
                className="font-display font-bold leading-tight"
                style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.75rem, 4vw, 2.5rem)" }}
                data-testid="text-current-album-title"
              >
                {currentAlbum.title}
              </h1>
              <div className="text-muted-foreground text-sm mt-1">
                {currentAlbum.year} • {currentAlbum.tracks.length} tracks
              </div>
              <div className="mt-4">
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/albums/${currentAlbum.id}`}>View album page <ArrowRight className="h-4 w-4 ml-1.5" /></Link>
                </Button>
              </div>
            </div>
            <AlbumCover
              album={currentAlbum}
              sizeClass="h-24 w-24 sm:h-32 sm:w-32"
              roundedClass="rounded-lg"
            />
          </div>
        </CardContent>
      </Card>

      <AlbumBracketEditor album={currentAlbum} />

      {/* Community (Parrothead Madness) voting + favorites for the live album */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="font-display text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
            Parrothead Madness
          </h2>
        </div>
        <p className="text-sm text-muted-foreground -mt-2">
          The whole crew votes here. Each open round is tallied separately from the family bracket.
        </p>
        <CommunityVoting album={currentAlbum} />
      </section>

      <section>
        <AlbumFavoritePicker album={currentAlbum} />
      </section>
    </div>
  );
}

function Hero() {
  return (
    <div className="text-center py-8 sm:py-12">
      <h1
        className="font-display font-bold leading-[1.05] mb-3"
        style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2rem, 6vw, 3.25rem)" }}
      >
        The Buffett Bracket
      </h1>
      <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto">
        A song-by-song family showdown through every Jimmy Buffett studio album, from <em>Down to Earth</em> to <em>Equal Strain on All Parts</em>.
      </p>
    </div>
  );
}

function SkeletonPage() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-32 rounded-xl bg-muted" />
      <div className="h-64 rounded-xl bg-muted" />
    </div>
  );
}
