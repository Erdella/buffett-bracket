import { useQuery, useMutation } from "@tanstack/react-query";
import type { Album, AlbumRatingData, TierGrade } from "@/lib/types";
import { TIER_GRADES } from "@/lib/types";
import { TIER_STYLE, TIER_DESCRIPTION } from "@/lib/tier";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Star, Users, Eraser } from "lucide-react";
import { openMemberSignIn } from "@/components/member-auth-button";

/**
 * Lets a signed-in member grade the WHOLE album S–F (their "tier"). Their grade
 * rolls up into their personal tier list on My Brackets and into the album's
 * community average (shown here once enough members have rated it).
 */
export function AlbumRating({ album }: { album: Album }) {
  const { member } = useAuth();
  const { toast } = useToast();

  const rating = useQuery<AlbumRatingData>({
    queryKey: ["/api/albums", album.id, "rating"],
    refetchInterval: 30_000,
  });

  const mutation = useMutation({
    mutationFn: async (grade: TierGrade | null) => {
      await apiRequest("POST", "/api/community/rate", { albumId: album.id, grade });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/albums", album.id, "rating"] });
      queryClient.invalidateQueries({ queryKey: ["/api/community/my-tiers"] });
    },
    onError: () => toast({ title: "Couldn't save your grade", description: "Please try again.", variant: "destructive" }),
  });

  const data = rating.data;
  const myGrade = data?.myGrade ?? null;
  const avg = data?.averageGrade ?? null;
  const count = data?.count ?? 0;
  const minRatings = data?.minRatings ?? 3;

  function pick(grade: TierGrade) {
    if (!member) { openMemberSignIn(); return; }
    // Tapping the current grade again clears it (toggle off).
    mutation.mutate(myGrade === grade ? null : grade);
  }

  return (
    <Card className="border-card-border">
      <CardContent className="p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Star className="h-5 w-5 text-primary" />
            <h3 className="font-display text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
              Rate this album
            </h3>
          </div>
          {/* Community average — hidden until enough ratings exist. */}
          {avg ? (
            <div className="flex items-center gap-2 text-sm" data-testid={`rating-average-${album.id}`}>
              <span className="text-muted-foreground flex items-center gap-1">
                <Users className="h-3.5 w-3.5" /> Community
              </span>
              <span className={cn("inline-flex h-7 w-7 items-center justify-center rounded-md font-display font-extrabold", TIER_STYLE[avg].chip)}>
                {avg}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">({count})</span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground" data-testid={`rating-average-pending-${album.id}`}>
              {count > 0
                ? `${count} of ${minRatings} ratings — average shows at ${minRatings}`
                : "No ratings yet"}
            </span>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          {member
            ? "Give the whole album a grade. S is the top tier; F is the bottom. Tap your grade again to clear it."
            : "Sign in to grade this album and build your own tier list."}
        </p>

        {/* S A B C D F selector */}
        <div className="grid grid-cols-6 gap-1.5 sm:gap-2">
          {TIER_GRADES.map(g => {
            const active = myGrade === g;
            const style = TIER_STYLE[g];
            return (
              <button
                key={g}
                type="button"
                onClick={() => pick(g)}
                disabled={mutation.isPending}
                title={TIER_DESCRIPTION[g]}
                data-testid={`rate-${album.id}-${g}`}
                aria-pressed={active}
                className={cn(
                  "relative rounded-lg py-2.5 font-display text-xl font-extrabold transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  style.chip,
                  active
                    ? "ring-2 ring-primary ring-offset-2 ring-offset-background scale-[1.04] shadow-md"
                    : "opacity-55 hover:opacity-100 hover:scale-[1.03]",
                  mutation.isPending && "cursor-wait",
                )}
              >
                {g}
              </button>
            );
          })}
        </div>

        {myGrade && (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">
              You rated this album{" "}
              <span className={cn("inline-flex h-5 items-center rounded px-1.5 font-display font-bold", TIER_STYLE[myGrade].chip)}>{myGrade}</span>
            </span>
            <button
              type="button"
              onClick={() => mutation.mutate(null)}
              disabled={mutation.isPending}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              data-testid={`rate-clear-${album.id}`}
            >
              <Eraser className="h-3.5 w-3.5" /> Clear
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
