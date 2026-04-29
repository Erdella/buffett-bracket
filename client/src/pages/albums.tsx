import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Album, AlbumStatus, Settings } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Trophy, Hourglass, Music, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useMemo } from "react";

export default function Albums() {
  const [q, setQ] = useState("");
  const albums = useQuery<Album[]>({ queryKey: ["/api/albums"] });
  const statuses = useQuery<AlbumStatus[]>({ queryKey: ["/api/album-status"] });
  const settings = useQuery<Settings>({ queryKey: ["/api/settings"] });

  const filtered = useMemo(() => {
    if (!albums.data) return [];
    if (!q.trim()) return albums.data;
    const s = q.toLowerCase();
    return albums.data.filter(a => a.title.toLowerCase().includes(s) || String(a.year).includes(s));
  }, [albums.data, q]);

  const statusFor = (id: number) => statuses.data?.find(s => s.albumId === id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold" style={{ fontFamily: "var(--font-display)" }}>The Discography</h1>
        <p className="text-sm text-muted-foreground mt-1">All 32 studio albums, in chronological order.</p>
      </div>

      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search albums or year..."
          className="pl-9"
          data-testid="input-search-albums"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {filtered.map(album => {
          const st = statusFor(album.id);
          const isCurrent = settings.data?.currentAlbumId === album.id;
          const completed = st?.status === "completed";
          const inProgress = st?.status === "in_progress";
          return (
            <Link
              key={album.id}
              href={`/albums/${album.id}`}
              data-testid={`link-album-${album.id}`}
              className="block"
            >
              <Card className={cn(
                "h-full hover-elevate active-elevate transition-shadow",
                isCurrent && "ring-2 ring-primary ring-offset-2 ring-offset-background",
              )}>
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="text-xs text-muted-foreground font-mono">{album.year}</div>
                    <StatusPill completed={completed} inProgress={inProgress} isCurrent={isCurrent} />
                  </div>
                  <div className="font-display font-bold text-base leading-tight mb-2" style={{ fontFamily: "var(--font-display)" }}>
                    {album.title}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Music className="h-3 w-3" /> {album.tracks.length} tracks
                  </div>
                  {completed && st?.winningSong && (
                    <div className="mt-3 pt-3 border-t border-border/60">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Winner</div>
                      <div className="text-sm font-semibold flex items-center gap-1.5 mt-0.5">
                        <Trophy className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="truncate">{st.winningSong}</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function StatusPill({ completed, inProgress, isCurrent }: { completed: boolean; inProgress: boolean; isCurrent: boolean }) {
  if (completed) {
    return (
      <Badge variant="secondary" className="text-[10px] gap-1">
        <Trophy className="h-3 w-3" /> Done
      </Badge>
    );
  }
  if (isCurrent) {
    return <Badge className="text-[10px] bg-primary text-primary-foreground">Now playing</Badge>;
  }
  if (inProgress) {
    return (
      <Badge variant="outline" className="text-[10px] gap-1">
        <Hourglass className="h-3 w-3" /> In progress
      </Badge>
    );
  }
  return <Badge variant="outline" className="text-[10px] text-muted-foreground">Upcoming</Badge>;
}
