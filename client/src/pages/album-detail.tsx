import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import type { Album, AlbumStatus, AlbumResult, Player } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlbumCover } from "@/components/album-cover";
import { AlbumArena } from "@/components/album-arena";
import { PlayerAvatar } from "@/components/player-avatar";
import { ArrowLeft, ArrowRight, Trophy, Music, Camera, X } from "lucide-react";
import { useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { assetUrl, queryClient } from "@/lib/queryClient";

export default function AlbumDetail() {
  const [, params] = useRoute<{ id: string }>("/albums/:id");
  const id = params ? Number(params.id) : null;

  const album = useQuery<Album>({ queryKey: ["/api/albums", id], enabled: !!id });
  const status = useQuery<AlbumStatus | null>({ queryKey: ["/api/albums", id, "status"], enabled: !!id });
  const albums = useQuery<Album[]>({ queryKey: ["/api/albums"] });
  const auth = useAuth();
  // Per-player family favorites are family-only data; don't even fetch them
  // for outsiders so nothing family-related reaches the client.
  const players = useQuery<Player[]>({ queryKey: ["/api/players"], enabled: auth.isFamily });
  const results = useQuery<AlbumResult[]>({ queryKey: ["/api/albums", id, "results"], enabled: !!id && auth.isFamily });

  if (!album.data) return <div className="text-sm text-muted-foreground">Loading...</div>;
  const a = album.data;
  const st = status.data;
  const isComplete = st?.status === "completed";

  // Prev/next album navigation, ordered chronologically by orderIndex.
  const ordered = (albums.data ?? []).slice().sort((x, y) => x.orderIndex - y.orderIndex);
  const idx = ordered.findIndex(x => x.id === a.id);
  const prev = idx > 0 ? ordered[idx - 1] : null;
  const next = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null;

  return (
    <div className="space-y-6">
      {/* Prev / next album navigation */}
      <div className="flex items-center justify-between gap-3 text-sm">
        <div className="min-w-0 flex-1">
          {prev ? (
            <Link
              href={`/albums/${prev.id}`}
              className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground truncate"
              data-testid="link-prev-album"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" />
              <span className="truncate">
                <span className="text-[10px] uppercase tracking-wider mr-1.5">Previous</span>
                <span className="font-semibold">{prev.title}</span>
              </span>
            </Link>
          ) : <span />}
        </div>
        <div className="min-w-0 flex-1 text-right">
          {next ? (
            <Link
              href={`/albums/${next.id}`}
              className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground truncate justify-end max-w-full"
              data-testid="link-next-album"
            >
              <span className="truncate">
                <span className="text-[10px] uppercase tracking-wider mr-1.5">Next</span>
                <span className="font-semibold">{next.title}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0" />
            </Link>
          ) : <span />}
        </div>
      </div>

      <Button variant="ghost" size="sm" asChild data-testid="button-back-albums">
        <Link href="/albums"><ArrowLeft className="h-4 w-4 mr-1.5" /> All albums</Link>
      </Button>

      <Card>
        <div className="sun-gradient h-2" />
        <CardContent className="p-5 sm:p-7">
          <div className="flex flex-col sm:flex-row gap-5 sm:gap-7">
            {/* Cover artwork on the left at the top of the page */}
            <CoverWithEditor album={a} canEdit={auth.isAdmin} />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-mono text-muted-foreground">{a.year}</div>
              <h1 className="font-display font-bold mt-1" style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.75rem, 4vw, 2.5rem)" }}>
                {a.title}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline">{a.tracks.length} tracks</Badge>
                {/* Album status badges track the FAMILY bracket lifecycle, so
                    they're only shown to family. Outsiders just see track count. */}
                {auth.isFamily && isComplete && <Badge className="bg-primary text-primary-foreground"><Trophy className="h-3 w-3 mr-1" /> Completed</Badge>}
                {auth.isFamily && st?.status === "in_progress" && <Badge variant="secondary">In progress</Badge>}
                {auth.isFamily && !st && <Badge variant="outline" className="text-muted-foreground">Not started</Badge>}
              </div>
              {auth.isFamily && isComplete && st?.winningSong && (
                <div className="mt-5 p-4 rounded-lg bg-primary/10 border border-primary/30">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Family winner</div>
                  <div className="font-display text-xl font-bold mt-0.5" style={{ fontFamily: "var(--font-display)" }}>{st.winningSong}</div>
                  {st.runnerUpSong && (
                    <div className="text-xs text-muted-foreground mt-1">Runner up: {st.runnerUpSong}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Family bracket + community voting, cleanly separated by tab. */}
      <AlbumArena album={a} />

      <section>
        <h2 className="font-display text-xl font-bold mb-3 flex items-center gap-2" style={{ fontFamily: "var(--font-display)" }}>
          <Music className="h-5 w-5 text-muted-foreground" /> Tracklist
        </h2>
        <Card>
          <CardContent className="p-0 divide-y divide-border/60">
            {a.tracks.map((t, i) => {
              // Find every player whose personal favorite matches this track—
              // we surface their avatars on the right of the row so it's easy
              // to see at a glance who loves what.
              const fans = auth.isFamily
                ? (results.data ?? [])
                    .filter(r => r.songTitle === t)
                    .map(r => (players.data ?? []).find(p => p.id === r.playerId))
                    .filter((p): p is Player => !!p)
                : [];
              // The trophy marks the FAMILY winner — only family sees it.
              const isWinner = auth.isFamily && st?.winningSong === t;
              return (
                <div key={i} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                  <span className="text-xs text-muted-foreground font-mono w-6 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                  <span className="truncate flex-1">{t}</span>
                  {fans.length > 0 && (
                    <div className="flex items-center gap-1 shrink-0" data-testid={`fans-track-${i}`}>
                      {fans.map(p => (
                        <PlayerAvatar
                          key={p.id}
                          player={p}
                          sizeClass="h-6 w-6"
                          textSizeClass="text-[10px]"
                        />
                      ))}
                    </div>
                  )}
                  {isWinner && <Trophy className="h-3.5 w-3.5 text-primary shrink-0" />}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

/**
 * Cover artwork at the top of the album page. When logged in as admin, hovering
 * reveals an upload overlay; an existing cover gets a remove button.
 */
function CoverWithEditor({ album, canEdit }: { album: Album; canEdit: boolean }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  async function uploadCover(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("cover", file);
      const res = await fetch(assetUrl(`/api/albums/${album.id}/cover`)!, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.text()) || `${res.status}`);
      await queryClient.invalidateQueries({ queryKey: ["/api/albums"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/albums", album.id] });
      toast({ title: "Cover updated", description: `${album.title} now has cover art.` });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e?.message ?? "Try a smaller image.", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function clearCover() {
    try {
      const res = await fetch(assetUrl(`/api/albums/${album.id}/cover`)!, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.text()) || `${res.status}`);
      await queryClient.invalidateQueries({ queryKey: ["/api/albums"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/albums", album.id] });
    } catch (e: any) {
      toast({ title: "Could not remove cover", description: e?.message ?? "", variant: "destructive" });
    }
  }

  if (!canEdit) {
    return <AlbumCover album={album} sizeClass="h-32 w-32 sm:h-40 sm:w-40" roundedClass="rounded-lg" />;
  }

  return (
    <div className="relative shrink-0 group self-start">
      <AlbumCover album={album} sizeClass="h-32 w-32 sm:h-40 sm:w-40" roundedClass="rounded-lg" />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="absolute inset-0 rounded-lg flex flex-col items-center justify-center gap-1 bg-black/55 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        aria-label={`Upload cover for ${album.title}`}
        data-testid={`button-upload-cover-${album.id}`}
      >
        <Camera className="h-6 w-6" />
        <span className="text-xs font-semibold">{uploading ? "Uploading..." : album.coverUrl ? "Replace cover" : "Add cover"}</span>
      </button>
      {album.coverUrl && (
        <button
          type="button"
          onClick={clearCover}
          className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-white flex items-center justify-center shadow ring-2 ring-background"
          aria-label={`Remove cover for ${album.title}`}
          title="Remove cover"
          data-testid={`button-remove-cover-${album.id}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) uploadCover(f);
        }}
        data-testid={`input-cover-${album.id}`}
      />
    </div>
  );
}
