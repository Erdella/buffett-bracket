import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useRoute, Link } from "wouter";
import type {
  AdminMemberOverview,
  AdminMemberAlbumOverview,
  AdminMemberBracket,
  PersonalMatch,
} from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { roundLabel } from "@/components/community-bracket";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  Lock, ArrowLeft, Crown, Heart, Check, ChevronDown, ChevronRight, CheckCircle2,
} from "lucide-react";

/**
 * Admin-only, READ-ONLY viewer of a single member's brackets. From the admin
 * Members list the admin clicks "View brackets" and lands here. We show an
 * album-by-album summary (champion + favorite + progress), and each album can
 * be expanded to reveal that member's full bracket — every matchup, the song
 * they picked, round by round, up to their crowned champion. Nothing here is
 * editable: this is observation only, not impersonation.
 */
export default function MemberBrackets() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const [, params] = useRoute("/admin/members/:id");
  const memberId = params ? Number(params.id) : NaN;

  const overview = useQuery<AdminMemberOverview>({
    queryKey: ["/api/admin/members", memberId, "overview"],
    enabled: isAdmin && Number.isFinite(memberId),
  });

  if (authLoading) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }
  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto py-12 text-center space-y-3">
        <Lock className="h-10 w-10 mx-auto text-muted-foreground" />
        <h1 className="font-display text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>Admin only</h1>
        <p className="text-sm text-muted-foreground">Tap the lock icon in the header to log in.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link href="/admin">
          <Button variant="ghost" size="sm" className="-ml-2" data-testid="link-back-to-admin">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Admin
          </Button>
        </Link>
        {overview.data ? (
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold" style={{ fontFamily: "var(--font-display)" }} data-testid="text-member-name">
              {overview.data.member.displayName || "(no name)"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1" data-testid="text-member-email">
              {overview.data.member.email} · Read-only view of their brackets
            </p>
            <div className="flex items-center gap-2 flex-wrap mt-3">
              <Badge variant="secondary" data-testid="badge-completed">
                {overview.data.completedAlbums} of {overview.data.availableAlbums} albums finished
              </Badge>
            </div>
          </div>
        ) : (
          <div className="h-16 rounded-lg bg-muted animate-pulse" />
        )}
      </div>

      {overview.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map(i => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : !overview.data ? (
        <Card className="border-dashed border-2">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Couldn't load this member. They may have been removed.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {overview.data.albums.map(a => (
            <AlbumRow key={a.albumId} memberId={memberId} album={a} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One album's summary row. Collapsed by default; expanding it lazily fetches
 * and renders the member's full read-only bracket for that album.
 */
function AlbumRow({ memberId, album }: { memberId: number; album: AdminMemberAlbumOverview }) {
  const [open, setOpen] = useState(false);

  const statusBadge = () => {
    switch (album.status) {
      case "done":
        return <Badge className="text-[10px] bg-primary text-primary-foreground">Complete</Badge>;
      case "in_progress":
        return <Badge variant="secondary" className="text-[10px]">In progress</Badge>;
      case "not_started":
        return <Badge variant="outline" className="text-[10px]">Not started</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px] text-muted-foreground">No bracket</Badge>;
    }
  };

  return (
    <Card className="border-card-border overflow-hidden">
      <button
        type="button"
        onClick={() => album.available && setOpen(o => !o)}
        disabled={!album.available}
        className={cn(
          "w-full text-left",
          album.available ? "hover-elevate cursor-pointer" : "cursor-default",
        )}
        data-testid={`button-toggle-album-${album.albumId}`}
        aria-expanded={open}
      >
        <CardContent className="p-4 flex items-start gap-3">
          <div className="mt-0.5 shrink-0 text-muted-foreground">
            {album.available
              ? (open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)
              : <span className="inline-block w-4" />}
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-display font-bold text-base" style={{ fontFamily: "var(--font-display)" }} data-testid={`text-album-title-${album.albumId}`}>
                {album.title}
              </span>
              <span className="text-xs text-muted-foreground">({album.year})</span>
              {statusBadge()}
            </div>
            {album.available && (
              <div className="text-xs text-muted-foreground">
                {album.madePicks} of {album.totalPicks} picks made
              </div>
            )}
            <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-sm">
              {album.champion && (
                <span className="inline-flex items-center gap-1.5" data-testid={`text-album-champion-${album.albumId}`}>
                  <Crown className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="text-muted-foreground">Champion:</span>
                  <strong>{album.champion}</strong>
                </span>
              )}
              {album.favorite && (
                <span className="inline-flex items-center gap-1.5" data-testid={`text-album-favorite-${album.albumId}`}>
                  <Heart className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="text-muted-foreground">Favorite:</span>
                  <strong>{album.favorite}</strong>
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </button>

      {open && album.available && (
        <div className="border-t border-card-border px-4 pb-4 pt-3 bg-muted/20">
          <AlbumBracket memberId={memberId} albumId={album.albumId} />
        </div>
      )}
    </Card>
  );
}

/** Lazily-loaded read-only full bracket for one member + one album. */
function AlbumBracket({ memberId, albumId }: { memberId: number; albumId: number }) {
  const q = useQuery<AdminMemberBracket>({
    queryKey: ["/api/admin/members", memberId, "albums", albumId, "bracket"],
  });

  if (q.isLoading || !q.data) {
    return <div className="h-32 rounded-lg bg-muted animate-pulse" />;
  }
  if (!q.data.available || !q.data.bracket) {
    return <p className="text-sm text-muted-foreground py-2">No bracket for this album yet.</p>;
  }

  const { bracket, favorite } = q.data;
  const { totalRounds, hasPrelims } = bracket;

  return (
    <div className="space-y-5">
      {favorite && (
        <div className="rounded-lg bg-primary/5 border border-primary/30 p-3 flex items-center gap-2.5 text-sm">
          <Heart className="h-4 w-4 text-primary shrink-0" />
          <span>Favorite song: <strong>{favorite}</strong></span>
        </div>
      )}

      {bracket.complete && bracket.champion && (
        <div className="rounded-lg bg-primary/10 border border-primary/30 p-3 flex items-center gap-2.5 text-sm">
          <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
          <span>Bracket complete — champion is <strong>{bracket.champion}</strong>.</span>
        </div>
      )}

      {bracket.rounds.map((matches, ri) => {
        const round = ri + 1;
        return (
          <div key={round} className="space-y-2.5" data-testid={`view-round-${round}`}>
            <h3 className="font-display font-bold text-sm" style={{ fontFamily: "var(--font-display)" }}>
              {roundLabel(round, totalRounds, hasPrelims)}
            </h3>
            <div className="grid gap-2.5">
              {matches.map(m => <ReadOnlyMatch key={`${round}-${m.matchIndex}`} match={m} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** A single read-only matchup: highlights the song this member picked. */
function ReadOnlyMatch({ match }: { match: PersonalMatch }) {
  const { songA, songB, pick } = match;
  const isBye = (!!songA && !songB) || (!!songB && !songA);
  const byeSong = songA || songB;

  if (isBye) {
    return (
      <Card className="border-card-border bg-muted/30">
        <CardContent className="p-3 flex items-center justify-between gap-2">
          <span className="font-medium text-sm">{byeSong}</span>
          <Badge variant="outline" className="text-[10px]">Bye — advances</Badge>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-card-border overflow-hidden">
      <CardContent className="p-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <ReadOnlyOption label={songA} picked={pick === songA} undecided={!pick} testId={`view-pick-a-${match.round}-${match.matchIndex}`} />
          <ReadOnlyOption label={songB} picked={pick === songB} undecided={!pick} testId={`view-pick-b-${match.round}-${match.matchIndex}`} />
        </div>
      </CardContent>
    </Card>
  );
}

function ReadOnlyOption({
  label, picked, undecided, testId,
}: {
  label: string | null;
  picked: boolean;
  undecided: boolean;
  testId: string;
}) {
  if (!label) return <div className="hidden sm:block" />;
  return (
    <div
      data-testid={testId}
      aria-pressed={picked}
      className={cn(
        "relative w-full text-left rounded-lg border p-3 min-h-[3.25rem] flex items-center justify-between gap-2",
        picked
          ? "border-primary bg-primary/10 ring-1 ring-primary"
          : undecided
            ? "border-border bg-card"
            : "border-border bg-card opacity-55",
      )}
    >
      <span className="font-medium text-sm leading-snug pr-2">{label}</span>
      {picked && <Check className="h-4 w-4 text-primary shrink-0" />}
    </div>
  );
}
