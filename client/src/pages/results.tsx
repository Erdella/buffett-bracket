import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Album, AlbumStatus, OGLeaderboardData, AllRatingsData, TierGrade } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlbumCover } from "@/components/album-cover";
import { TIER_STYLE, TIER_DESCRIPTION } from "@/lib/tier";
import { cn } from "@/lib/utils";
import { Trophy, ChevronRight, Users } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

/** Small filled grade pill for the community-average tier. */
function TierBadge({ grade, className }: { grade: TierGrade; className?: string }) {
  const style = TIER_STYLE[grade];
  return (
    <span
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded font-display font-extrabold text-sm shrink-0",
        style.chip,
        className,
      )}
      title={`Community grade: ${grade} — ${TIER_DESCRIPTION[grade]}`}
    >
      {grade}
    </span>
  );
}

export default function Results() {
  const auth = useAuth();
  const isFamily = auth.isFamily;
  const albums = useQuery<Album[]>({ queryKey: ["/api/albums"] });
  // Family album status is family-only — don't fetch it for outsiders.
  const statuses = useQuery<AlbumStatus[]>({ queryKey: ["/api/album-status"], enabled: isFamily });
  const og = useQuery<OGLeaderboardData>({ queryKey: ["/api/community/leaderboard"] });
  const ratings = useQuery<AllRatingsData>({ queryKey: ["/api/community/all-ratings"] });

  if (!albums.data || (isFamily && !statuses.data)) {
    return <div className="text-sm text-muted-foreground">Loading...</div>;
  }

  // albumId -> community average grade (only where >= min ratings).
  const gradeByAlbum = new Map<number, TierGrade>(
    (ratings.data?.ratings ?? [])
      .filter(r => r.averageGrade != null)
      .map(r => [r.albumId, r.averageGrade as TierGrade]),
  );

  // Outsiders get an OG-only view: every album with its OG community winner.
  if (!isFamily) {
    return <OGResults albums={albums.data} og={og.data} gradeByAlbum={gradeByAlbum} />;
  }

  // Map albumId -> OG community winner song (may be undefined while loading).
  const ogWinnerByAlbum = new Map<number, string | null>(
    (og.data?.albumWinners ?? []).map(w => [w.albumId, w.winner]),
  );

  const statusList = statuses.data ?? [];
  const items = albums.data.map(a => ({
    album: a,
    status: statusList.find(s => s.albumId === a.id),
  }));

  const completed = items.filter(i => i.status?.status === "completed");
  const inProgress = items.filter(i => i.status?.status === "in_progress");
  const upcoming = items.filter(i => !i.status || i.status.status === "not_started");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold" style={{ fontFamily: "var(--font-display)" }}>Album by Album</h1>
        <p className="text-sm text-muted-foreground mt-1">Every winner, every album, in order.</p>
      </div>

      <Stats completed={completed.length} total={items.length} />

      <Section title="Completed" count={completed.length}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {completed.map(({ album, status }) => (
            <Link key={album.id} href={`/albums/${album.id}`} data-testid={`link-completed-${album.id}`} className="block">
              <Card className="hover-elevate active-elevate h-full">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <AlbumCover album={album} sizeClass="h-14 w-14" roundedClass="rounded-md" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-muted-foreground font-mono">{album.year}</div>
                      <div className="font-display font-bold leading-tight mt-0.5 truncate" style={{ fontFamily: "var(--font-display)" }}>
                        {album.title}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  </div>
                  {status?.winningSong && (
                    <div className="mt-3 pt-3 border-t border-border/60 space-y-1.5">
                      <div className="flex items-center gap-1.5" data-testid={`family-winner-${album.id}`}>
                        <Trophy className="h-4 w-4 text-primary shrink-0" />
                        <span className="text-sm font-semibold truncate">{status.winningSong}</span>
                        <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">Family</span>
                      </div>
                      {ogWinnerByAlbum.get(album.id) && (
                        <div className="flex items-center gap-1.5" data-testid={`og-winner-${album.id}`}>
                          <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="text-sm truncate">{ogWinnerByAlbum.get(album.id)}</span>
                          <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">Original</span>
                        </div>
                      )}
                      {gradeByAlbum.get(album.id) && (
                        <div className="flex items-center gap-1.5" data-testid={`avg-grade-${album.id}`}>
                          <TierBadge grade={gradeByAlbum.get(album.id)!} className="h-4 w-4 text-[10px]" />
                          <span className="text-sm truncate">Community grade</span>
                          <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">Tier</span>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
        {completed.length === 0 && <Empty text="No completed albums yet — pick a winner from the current bracket." />}
      </Section>

      <Section title="In Progress" count={inProgress.length}>
        {inProgress.length === 0 ? (
          <Empty text="No albums currently in progress." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {inProgress.map(({ album }) => (
              <Link key={album.id} href={`/albums/${album.id}`} className="block">
                <Card className="hover-elevate active-elevate">
                  <CardContent className="p-4 flex items-center gap-3">
                    <AlbumCover album={album} sizeClass="h-12 w-12" roundedClass="rounded-md" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-muted-foreground font-mono">{album.year}</div>
                      <div className="font-semibold truncate">{album.title}</div>
                    </div>
                    <Badge variant="secondary" className="text-[10px] shrink-0">In progress</Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </Section>

      <Section title="Upcoming" count={upcoming.length}>
        <Card>
          <CardContent className="p-0 divide-y divide-border/60">
            {upcoming.map(({ album }) => (
              <Link key={album.id} href={`/albums/${album.id}`} className="block px-4 py-3 hover-elevate active-elevate flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0 flex items-center gap-3">
                  <AlbumCover album={album} sizeClass="h-10 w-10" roundedClass="rounded-md" />
                  <span className="font-mono text-xs text-muted-foreground w-12 shrink-0">{album.year}</span>
                  <span className="truncate">{album.title}</span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </Link>
            ))}
          </CardContent>
        </Card>
      </Section>
    </div>
  );
}

/**
 * The OG-only Results view shown to outsiders and non-family members.
 * Lists every album with its OG Parrothead Madness community winner where one
 * has been crowned. No family bracket, winners, or status leak through here.
 */
function OGResults({ albums, og, gradeByAlbum }: { albums: Album[]; og?: OGLeaderboardData; gradeByAlbum: Map<number, TierGrade> }) {
  const winnerByAlbum = new Map<number, string | null>(
    (og?.albumWinners ?? []).map(w => [w.albumId, w.winner]),
  );
  const ordered = albums.slice().sort((a, b) => a.orderIndex - b.orderIndex);
  const crowned = ordered.filter(a => !!winnerByAlbum.get(a.id));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold" style={{ fontFamily: "var(--font-display)" }}>Album by Album</h1>
        <p className="text-sm text-muted-foreground mt-1">The Original Parrothead Madness winner for every album.</p>
      </div>

      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold flex items-center gap-1.5"><Users className="h-4 w-4 text-secondary" /> Original winners crowned</div>
            <div className="text-sm text-muted-foreground">{crowned.length} of {ordered.length} albums</div>
          </div>
        </CardContent>
      </Card>

      <Section title="Winners" count={crowned.length}>
        {crowned.length === 0 ? (
          <Empty text="No album winners yet — vote in the current bracket to help crown the first." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {crowned.map(album => (
              <Link key={album.id} href={`/albums/${album.id}`} data-testid={`link-og-result-${album.id}`} className="block">
                <Card className="hover-elevate active-elevate h-full">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <AlbumCover album={album} sizeClass="h-14 w-14" roundedClass="rounded-md" />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-muted-foreground font-mono">{album.year}</div>
                        <div className="font-display font-bold leading-tight mt-0.5 truncate" style={{ fontFamily: "var(--font-display)" }}>
                          {album.title}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    </div>
                    <div className="mt-3 pt-3 border-t border-border/60 space-y-1.5">
                      <div className="flex items-center gap-1.5" data-testid={`og-winner-${album.id}`}>
                        <Trophy className="h-4 w-4 text-primary shrink-0" />
                        <span className="text-sm font-semibold truncate">{winnerByAlbum.get(album.id)}</span>
                        <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">Original</span>
                      </div>
                      {gradeByAlbum.get(album.id) && (
                        <div className="flex items-center gap-1.5" data-testid={`avg-grade-${album.id}`}>
                          <TierBadge grade={gradeByAlbum.get(album.id)!} className="h-4 w-4 text-[10px]" />
                          <span className="text-sm truncate">Community grade</span>
                          <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">Tier</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </Section>

      <Section title="All albums" count={ordered.length}>
        <Card>
          <CardContent className="p-0 divide-y divide-border/60">
            {ordered.map(album => (
              <Link key={album.id} href={`/albums/${album.id}`} className="block px-4 py-3 hover-elevate active-elevate flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0 flex items-center gap-3">
                  <AlbumCover album={album} sizeClass="h-10 w-10" roundedClass="rounded-md" />
                  <span className="font-mono text-xs text-muted-foreground w-12 shrink-0">{album.year}</span>
                  <span className="truncate">{album.title}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {gradeByAlbum.get(album.id) && <TierBadge grade={gradeByAlbum.get(album.id)!} className="h-5 w-5 text-xs" />}
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </Section>
    </div>
  );
}

function Stats({ completed, total }: { completed: number; total: number }) {
  const pct = total ? Math.round((completed / total) * 100) : 0;
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold">Family progress</div>
          <div className="text-sm text-muted-foreground">{completed} of {total} albums • {pct}%</div>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className="h-full sun-gradient transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </CardContent>
    </Card>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="font-display text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>{title}</h2>
        <span className="text-sm text-muted-foreground">{count}</span>
      </div>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="text-sm text-muted-foreground italic">{text}</div>;
}
