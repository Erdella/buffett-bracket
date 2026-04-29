import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import type { Album, AlbumStatus } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlbumBracketEditor } from "@/components/album-bracket-editor";
import { ArrowLeft, Trophy, Music } from "lucide-react";

export default function AlbumDetail() {
  const [, params] = useRoute<{ id: string }>("/albums/:id");
  const id = params ? Number(params.id) : null;

  const album = useQuery<Album>({ queryKey: ["/api/albums", id], enabled: !!id });
  const status = useQuery<AlbumStatus | null>({ queryKey: ["/api/albums", id, "status"], enabled: !!id });

  if (!album.data) return <div className="text-sm text-muted-foreground">Loading...</div>;
  const a = album.data;
  const st = status.data;
  const isComplete = st?.status === "completed";

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild data-testid="button-back-albums">
        <Link href="/albums"><ArrowLeft className="h-4 w-4 mr-1.5" /> All albums</Link>
      </Button>

      <Card>
        <div className="sun-gradient h-2" />
        <CardContent className="p-5 sm:p-7">
          <div className="text-xs font-mono text-muted-foreground">{a.year}</div>
          <h1 className="font-display font-bold mt-1" style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.75rem, 4vw, 2.5rem)" }}>
            {a.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline">{a.tracks.length} tracks</Badge>
            {isComplete && <Badge className="bg-primary text-primary-foreground"><Trophy className="h-3 w-3 mr-1" /> Completed</Badge>}
            {st?.status === "in_progress" && <Badge variant="secondary">In progress</Badge>}
            {!st && <Badge variant="outline" className="text-muted-foreground">Not started</Badge>}
          </div>
          {isComplete && st?.winningSong && (
            <div className="mt-5 p-4 rounded-lg bg-primary/10 border border-primary/30">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Family winner</div>
              <div className="font-display text-xl font-bold mt-0.5" style={{ fontFamily: "var(--font-display)" }}>{st.winningSong}</div>
              {st.runnerUpSong && (
                <div className="text-xs text-muted-foreground mt-1">Runner up: {st.runnerUpSong}</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Full editor — works the same for current album, in-progress backfill, and completed albums */}
      <AlbumBracketEditor album={a} />

      <section>
        <h2 className="font-display text-xl font-bold mb-3 flex items-center gap-2" style={{ fontFamily: "var(--font-display)" }}>
          <Music className="h-5 w-5 text-muted-foreground" /> Tracklist
        </h2>
        <Card>
          <CardContent className="p-0 divide-y divide-border/60">
            {a.tracks.map((t, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                <span className="text-xs text-muted-foreground font-mono w-6 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                <span className="truncate flex-1">{t}</span>
                {st?.winningSong === t && <Trophy className="h-3.5 w-3.5 text-primary shrink-0" />}
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
