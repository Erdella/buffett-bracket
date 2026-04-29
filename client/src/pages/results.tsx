import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Album, AlbumStatus } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, ChevronRight } from "lucide-react";

export default function Results() {
  const albums = useQuery<Album[]>({ queryKey: ["/api/albums"] });
  const statuses = useQuery<AlbumStatus[]>({ queryKey: ["/api/album-status"] });

  if (!albums.data || !statuses.data) {
    return <div className="text-sm text-muted-foreground">Loading...</div>;
  }

  const items = albums.data.map(a => ({
    album: a,
    status: statuses.data.find(s => s.albumId === a.id),
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
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-muted-foreground font-mono">{album.year}</div>
                      <div className="font-display font-bold leading-tight mt-0.5 truncate" style={{ fontFamily: "var(--font-display)" }}>
                        {album.title}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  </div>
                  {status?.winningSong && (
                    <div className="mt-3 pt-3 border-t border-border/60 flex items-center gap-1.5">
                      <Trophy className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-sm font-semibold truncate">{status.winningSong}</span>
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
                  <CardContent className="p-4 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground font-mono">{album.year}</div>
                      <div className="font-semibold truncate">{album.title}</div>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">In progress</Badge>
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
