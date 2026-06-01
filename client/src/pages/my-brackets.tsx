import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import type { MyProgress, MyProgressAlbum } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { openMemberSignIn } from "@/components/member-auth-button";
import { Trophy, Hourglass, Circle, CheckCircle2, ArrowRight, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";

export default function MyBrackets() {
  const { member, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  // This page is personal to a signed-in member. Once auth resolves and there's
  // no member, send them home (and pop the sign-in dialog so they can join).
  useEffect(() => {
    if (authLoading) return;
    if (!member) {
      navigate("/", { replace: true });
      openMemberSignIn();
    }
  }, [authLoading, member, navigate]);

  const progress = useQuery<MyProgress>({
    queryKey: ["/api/community/my-progress"],
    enabled: !!member,
  });

  const firstName = useMemo(() => (member?.displayName ?? "").trim().split(/\s+/)[0] || "", [member]);

  if (authLoading || !member) return <SkeletonPage />;
  if (progress.isLoading || !progress.data) return <SkeletonPage />;

  const { availableAlbums, completedAlbums, albums } = progress.data;
  const pct = availableAlbums > 0 ? Math.round((completedAlbums / availableAlbums) * 100) : 0;

  // Order: in progress first (closest to done), then not started, then done,
  // then unavailable — so the next thing to work on is up top.
  const rank: Record<MyProgressAlbum["status"], number> = {
    in_progress: 0, not_started: 1, done: 2, unavailable: 3,
  };
  const sorted = [...albums].sort((a, b) =>
    rank[a.status] - rank[b.status] || a.year - b.year,
  );
  const inProgress = sorted.filter(a => a.status === "in_progress");
  const notStarted = sorted.filter(a => a.status === "not_started");
  const done = sorted.filter(a => a.status === "done");

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
          {firstName ? `${firstName}'s Brackets` : "My Brackets"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your personal Parrothead Madness run, album by album. Pick at your own pace.
        </p>
      </div>

      {/* Overall summary */}
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Your progress</div>
              <div className="font-display text-xl font-bold mt-1" style={{ fontFamily: "var(--font-display)" }} data-testid="text-overall-progress">
                {completedAlbums} of {availableAlbums} albums crowned
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-display text-2xl font-bold text-primary leading-none" style={{ fontFamily: "var(--font-display)" }}>{pct}%</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mt-1">Complete</div>
            </div>
          </div>
          <Progress value={pct} className="mt-4 h-2" data-testid="progress-overall" />
          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><Hourglass className="h-3.5 w-3.5 text-primary" /> {inProgress.length} in progress</span>
            <span className="flex items-center gap-1.5"><Circle className="h-3.5 w-3.5" /> {notStarted.length} not started</span>
            <span className="flex items-center gap-1.5"><Trophy className="h-3.5 w-3.5 text-primary" /> {done.length} done</span>
          </div>
        </CardContent>
      </Card>

      {/* In progress */}
      {inProgress.length > 0 && (
        <Section title="Pick up where you left off" count={inProgress.length}>
          {inProgress.map(a => <AlbumRow key={a.albumId} album={a} />)}
        </Section>
      )}

      {/* Not started */}
      {notStarted.length > 0 && (
        <Section title="Not started yet" count={notStarted.length}>
          {notStarted.map(a => <AlbumRow key={a.albumId} album={a} />)}
        </Section>
      )}

      {/* Completed */}
      {done.length > 0 && (
        <Section title="Crowned" count={done.length}>
          {done.map(a => <AlbumRow key={a.albumId} album={a} />)}
        </Section>
      )}

      {availableAlbums === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No brackets are open yet. Check back soon — albums will appear here as they open up.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="font-display text-lg font-bold flex items-center gap-2" style={{ fontFamily: "var(--font-display)" }}>
        {title} <span className="text-sm font-normal text-muted-foreground">{count}</span>
      </h2>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function AlbumRow({ album }: { album: MyProgressAlbum }) {
  const { totalPicks, madePicks, status, champion } = album;
  const pct = totalPicks > 0 ? Math.round((madePicks / totalPicks) * 100) : 0;
  return (
    <Link href={`/albums/${album.albumId}`} className="block" data-testid={`link-my-album-${album.albumId}`}>
      <Card className="hover-elevate active-elevate transition-shadow">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-mono">{album.year}</span>
                <RowStatus status={status} />
              </div>
              <div className="font-display font-bold text-base leading-tight mt-0.5 truncate" style={{ fontFamily: "var(--font-display)" }}>
                {album.title}
              </div>

              {status === "done" && champion ? (
                <div className="text-sm font-semibold flex items-center gap-1.5 mt-2 text-primary">
                  <Trophy className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate" data-testid={`text-champion-${album.albumId}`}>{champion}</span>
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-3">
                  <Progress value={pct} className="h-1.5 flex-1" data-testid={`progress-album-${album.albumId}`} />
                  <span className="text-xs text-muted-foreground font-mono shrink-0 tabular-nums" data-testid={`text-picks-${album.albumId}`}>
                    {madePicks}/{totalPicks}
                  </span>
                </div>
              )}
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function RowStatus({ status }: { status: MyProgressAlbum["status"] }) {
  if (status === "done") {
    return <Badge variant="secondary" className="text-[10px] gap-1"><CheckCircle2 className="h-3 w-3" /> Done</Badge>;
  }
  if (status === "in_progress") {
    return <Badge variant="outline" className="text-[10px] gap-1"><Hourglass className="h-3 w-3" /> In progress</Badge>;
  }
  return <Badge variant="outline" className="text-[10px] text-muted-foreground gap-1"><ListChecks className="h-3 w-3" /> Not started</Badge>;
}

function SkeletonPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <Skeleton className="h-32 w-full rounded-xl" />
      <div className="space-y-2.5">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
      </div>
    </div>
  );
}
