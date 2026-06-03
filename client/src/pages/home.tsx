import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Album, AlbumStatus, Settings, OGLeaderboardData } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlbumCover } from "@/components/album-cover";
import { BuffettLogo } from "@/components/logo";
import { useAuth } from "@/hooks/use-auth";
import { openMemberSignIn } from "@/components/member-auth-button";
import {
  Swords,
  Trophy,
  Music,
  Users,
  ArrowRight,
  Sparkles,
  Mail,
  ListMusic,
  Vote,
} from "lucide-react";

export default function Home() {
  const { member, isFamily } = useAuth();
  const settings = useQuery<Settings>({ queryKey: ["/api/settings"] });
  const albums = useQuery<Album[]>({ queryKey: ["/api/albums"] });
  const leaderboard = useQuery<OGLeaderboardData>({ queryKey: ["/api/community/leaderboard"] });

  const currentId = settings.data?.currentAlbumId ?? null;
  const currentAlbum = albums.data?.find((a) => a.id === currentId) ?? null;

  // "Now Playing" (/now-playing) is the FAMILY bracket. Everyone else votes on
  // the current album's own page, where the OG community bracket lives. Pick the
  // right live-bracket destination for the viewer so no one hits a redirect.
  const liveBracketHref = isFamily
    ? "/now-playing"
    : currentAlbum
      ? `/albums/${currentAlbum.id}`
      : "/albums";

  // Album status carries the family winner, so it's family-only. Outsiders never
  // fetch it and never see the "Completed" badge on the home card.
  const status = useQuery<AlbumStatus | null>({
    queryKey: ["/api/albums", currentId, "status"],
    enabled: !!currentId && isFamily,
  });

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
            <Sparkles className="h-3 w-3 mr-1" /> OG Parrothead Madness
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
                  <Vote className="h-4 w-4" /> Go vote the current album
                </Link>
              </Button>
            ) : (
              <Button
                size="lg"
                onClick={() => openMemberSignIn()}
                className="gap-1.5"
                data-testid="button-hero-join"
              >
                <Mail className="h-4 w-4" /> Join &amp; cast your votes
              </Button>
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

      {/* ---------- LIVE STATUS STRIP ---------- */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Now playing */}
        <Card className="sm:col-span-2 border-card-border overflow-hidden">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
                <Sparkles className="h-3 w-3 mr-1" /> Now Playing
              </Badge>
              {isFamily && status.data?.status === "completed" && (
                <Badge className="bg-primary text-primary-foreground text-[10px]">Completed</Badge>
              )}
            </div>
            {currentAlbum ? (
              <div className="flex items-center gap-4">
                <AlbumCover
                  album={currentAlbum}
                  sizeClass="h-16 w-16 sm:h-20 sm:w-20"
                  roundedClass="rounded-lg"
                />
                <div className="min-w-0 flex-1">
                  <div
                    className="font-display font-bold text-lg sm:text-xl truncate"
                    style={{ fontFamily: "var(--font-display)" }}
                    data-testid="text-home-current-album"
                  >
                    {currentAlbum.title}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {currentAlbum.year} • {currentAlbum.tracks.length} tracks
                  </div>
                  <Button variant="ghost" size="sm" asChild className="mt-2 -ml-2 h-8">
                    <Link href={liveBracketHref}>
                      Open the bracket <ArrowRight className="h-4 w-4 ml-1.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-muted-foreground">
                <Music className="h-5 w-5" />
                <span className="text-sm">
                  No album is in play right now — check back soon for the next round.
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick stats */}
        <div className="grid grid-cols-2 sm:grid-cols-1 gap-4">
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
        </div>
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
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
            icon={<Trophy className="h-5 w-5" />}
            title="Crown a champion"
            body="Songs advance round by round until one track is crowned the album's winner. Then we move to the next record."
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
          OG Parrothead Madness members each play their own bracket from the
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
