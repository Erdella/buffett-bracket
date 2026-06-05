import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Album, Settings, OGLeaderboardData, MyProgress } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BuffettLogo } from "@/components/logo";
import { useAuth } from "@/hooks/use-auth";
import { openMemberSignIn } from "@/components/member-auth-button";
import {
  Swords,
  Trophy,
  Users,
  ArrowRight,
  Sparkles,
  Mail,
  ListMusic,
  Vote,
  Scale,
} from "lucide-react";

export default function Home() {
  const { member, isFamily } = useAuth();
  const settings = useQuery<Settings>({ queryKey: ["/api/settings"] });
  const albums = useQuery<Album[]>({ queryKey: ["/api/albums"] });
  const leaderboard = useQuery<OGLeaderboardData>({ queryKey: ["/api/community/leaderboard"] });

  const currentId = settings.data?.currentAlbumId ?? null;
  const currentAlbum = albums.data?.find((a) => a.id === currentId) ?? null;

  // For a signed-in OG community member, send them to the oldest album they
  // still have voting to do — preferring one they've already started, then the
  // oldest one they haven't touched. (Only fetched for non-family members.)
  const progress = useQuery<MyProgress>({
    queryKey: ["/api/community/my-progress"],
    enabled: !!member && !isFamily,
  });

  // my-progress albums are ordered oldest-first (by orderIndex).
  const progressAlbums = progress.data?.albums ?? [];
  const nextMemberAlbum =
    progressAlbums.find((a) => a.status === "in_progress") ??
    progressAlbums.find((a) => a.status === "not_started" && a.available) ??
    null;

  // "Now Playing" (/now-playing) is the FAMILY bracket. Community members vote on
  // a specific album's own page, where the OG community bracket lives. Pick the
  // right live-bracket destination for the viewer so no one hits a redirect.
  const liveBracketHref = isFamily
    ? "/now-playing"
    : nextMemberAlbum
      ? `/albums/${nextMemberAlbum.albumId}`
      : currentAlbum
        ? `/albums/${currentAlbum.id}`
        : "/albums";

  // Label the hero CTA to match where it actually sends a community member:
  // resume an in-progress album, start the next untouched one, or fall back.
  const heroVoteLabel = isFamily
    ? "Go vote the current album"
    : nextMemberAlbum?.status === "in_progress"
      ? "Keep voting your bracket"
      : nextMemberAlbum
        ? "Start your next album"
        : "Go vote the current album";

  const totalAlbums = albums.data?.length ?? 0;
  const completedAlbums =
    leaderboard.data?.albumWinners.filter((w) => !!w.winner).length ?? 0;
  const memberCount = leaderboard.data?.members.length ?? 0;
  const progressPct =
    totalAlbums > 0 ? Math.round((completedAlbums / totalAlbums) * 100) : 0;

  return (
    <div className="space-y-12 sm:space-y-16">
      {/* ---------- HERO ---------- */}
      <section className="relative overflow-hidden rounded-2xl border border-card-border">
        <div className="sun-gradient absolute inset-0 opacity-90" aria-hidden />
        <div className="relative px-6 sm:px-10 py-12 sm:py-16 text-center">
          <BuffettLogo className="mx-auto h-14 w-14 sm:h-16 sm:w-16 mb-5 drop-shadow" />
          <Badge
            className="mb-4 text-[11px] uppercase tracking-wider bg-[hsl(195_50%_12%)] text-white border-transparent hover:bg-[hsl(195_50%_12%)]"
          >
            <Sparkles className="h-3 w-3 mr-1" /> The Original Parrothead Madness!
          </Badge>
          <h1
            className="font-display font-bold leading-[1.05] mb-4 text-[hsl(195_50%_12%)]"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(2.25rem, 6vw, 3.75rem)",
            }}
          >
            A song-by-song
            <br className="hidden sm:block" /> Jimmy Buffett showdown
          </h1>
          <p className="text-sm sm:text-lg text-[hsl(195_45%_18%)]/85 max-w-2xl mx-auto mb-8">
            We're bracketing every track on every Jimmy Buffett studio album —
            one album at a time — and letting Parrotheads vote their favorites
            head-to-head until one song from each record is crowned. Fins up.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            {member ? (
              <Button
                size="lg"
                asChild
                className="gap-1.5"
                data-testid="button-hero-play"
              >
                <Link href={liveBracketHref}>
                  <Vote className="h-4 w-4" /> {heroVoteLabel}
                </Link>
              </Button>
            ) : (
              <div className="flex flex-col items-center gap-1.5">
                <Button
                  size="lg"
                  onClick={() => openMemberSignIn()}
                  className="gap-1.5"
                  data-testid="button-hero-join"
                >
                  <Mail className="h-4 w-4" /> Join &amp; cast your votes
                </Button>
                <span
                  className="text-xs text-[hsl(195_45%_18%)]/75"
                  data-testid="text-hero-nopassword"
                >
                  No password needed — just your email.
                </span>
              </div>
            )}
            <Button
              size="lg"
              variant="outline"
              asChild
              className="gap-1.5 bg-white/70 hover:bg-white/90 border-white/60"
              data-testid="button-hero-now-playing"
            >
              <Link href={liveBracketHref}>
                Watch the live bracket <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ---------- QUICK STATS ---------- */}
      <section className="grid grid-cols-2 gap-4">
        <Stat
          icon={<Users className="h-4 w-4" />}
          value={memberCount}
          label="Parrotheads playing"
          testId="stat-members"
        />
        <Stat
          icon={<Trophy className="h-4 w-4" />}
          value={`${completedAlbums} / ${totalAlbums}`}
          label="Albums crowned"
          testId="stat-albums"
        />
      </section>

      {/* Discography progress */}
      {totalAlbums > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium flex items-center gap-1.5">
              <ListMusic className="h-4 w-4 text-secondary" /> Discography progress
            </span>
            <span className="text-muted-foreground" data-testid="text-progress">
              {completedAlbums} of {totalAlbums} albums done
            </span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full sun-gradient rounded-full transition-all"
              style={{ width: `${progressPct}%` }}
              data-testid="bar-progress"
            />
          </div>
        </section>
      )}

      {/* ---------- HOW IT WORKS ---------- */}
      <section>
        <div className="text-center mb-8">
          <h2
            className="font-display font-bold mb-2"
            style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.5rem, 4vw, 2rem)" }}
          >
            How it works
          </h2>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto">
            New here? It's a March-Madness-style bracket — but for songs. Here's the rundown.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
          <Step
            n={1}
            icon={<ListMusic className="h-5 w-5" />}
            title="One album at a time"
            body="Every track on a Jimmy Buffett studio album is seeded into a bracket — top songs facing off against the deep cuts."
          />
          <Step
            n={2}
            icon={<Swords className="h-5 w-5" />}
            title="Vote head-to-head"
            body="Each round you pick your favorite in every matchup. Your picks build your own personal bracket for that album."
          />
          <Step
            n={3}
            icon={<Scale className="h-5 w-5" />}
            title="Later rounds count more"
            body="Picks are weighted: an early-round pick is worth 1 point, a semifinal pick 2, and the championship pick 4 — so how a song wins matters, not just that it wins."
          />
          <Step
            n={4}
            icon={<Trophy className="h-5 w-5" />}
            title="Crown a champion"
            body="We tally everyone's weighted points; the song with the most is crowned the album's winner. Then we move on to the next record."
          />
        </div>
      </section>

      {/* ---------- COMMUNITY / OG GROUP ---------- */}
      <section className="rounded-2xl border border-card-border bg-accent/40 px-6 sm:px-10 py-9 sm:py-11 text-center">
        <h2
          className="font-display font-bold mb-2"
          style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.5rem, 4vw, 2rem)" }}
        >
          Run your own bracket
        </h2>
        <p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto mb-3">
          The Original Parrothead Madness members each play their own bracket from the
          same seed order. We track champion accuracy, how often your picks
          match the crowd, and who agrees with whom — all on the leaderboard.
        </p>
        <p className="text-sm text-muted-foreground max-w-2xl mx-auto mb-7">
          Sign in with just your email — we send a one-tap magic link, no
          password to remember. Add a photo and a name and you're in.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          {member ? (
            <Button size="lg" asChild className="gap-1.5" data-testid="button-cta-leaderboard">
              <Link href="/leaderboard">
                <Trophy className="h-4 w-4" /> See the leaderboard
              </Link>
            </Button>
          ) : (
            <Button
              size="lg"
              onClick={() => openMemberSignIn()}
              className="gap-1.5"
              data-testid="button-cta-join"
            >
              <Mail className="h-4 w-4" /> Sign in to join
            </Button>
          )}
          <Button size="lg" variant="outline" asChild className="gap-1.5" data-testid="button-cta-leaderboard-secondary">
            <Link href="/leaderboard">
              View the leaderboard <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

function Stat({
  icon,
  value,
  label,
  testId,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
  testId?: string;
}) {
  return (
    <Card className="border-card-border">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-2 text-secondary mb-1.5">
          {icon}
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
        </div>
        <div
          className="font-display font-bold text-2xl sm:text-3xl leading-none"
          style={{ fontFamily: "var(--font-display)" }}
          data-testid={testId}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function Step({
  n,
  icon,
  title,
  body,
}: {
  n: number;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Card className="border-card-border h-full">
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
            {icon}
          </div>
          <span className="text-xs font-semibold text-muted-foreground">
            Step {n}
          </span>
        </div>
        <div
          className="font-display font-bold text-base sm:text-lg mb-1.5"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {title}
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
      </CardContent>
    </Card>
  );
}
