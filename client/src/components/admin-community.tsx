import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Album, AdminMember } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Users, ShieldOff, ShieldCheck, Mail, Trophy } from "lucide-react";

/**
 * Admin view for the Parrothead Madness community layer.
 *
 * Community voting is now ALWAYS OPEN — each member fills out their own bracket
 * whenever they like, so there's no round to open or close. This card just
 * explains the model; the real admin work here is managing members.
 */
export function AdminCommunity({ albums: _albums }: { albums: Album[] }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5 sm:p-6 space-y-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <div className="font-semibold">Parrothead Madness — How community voting works</div>
          </div>
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2 text-sm">
            <p className="flex items-start gap-2">
              <Trophy className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <span>
                Voting is <strong>always open</strong>. Every member fills out their own bracket on the
                current album — they start from the same round-1 matchups, then their own picks advance.
              </span>
            </p>
            <p className="text-muted-foreground">
              Album winners are scored by weighted points across everyone's picks:
              <strong className="text-foreground"> 1 pt</strong> for an early-round pick,
              <strong className="text-foreground"> 2 pts</strong> in the semifinals, and
              <strong className="text-foreground"> 4 pts</strong> in the championship.
              The song with the most points wins; ties are listed alphabetically.
            </p>
            <p className="text-muted-foreground">
              These community results stay completely separate from the family bracket — both show side by
              side under the Family / Community tabs on each album.
            </p>
          </div>
        </CardContent>
      </Card>

      <MemberManagement />
    </div>
  );
}

function MemberManagement() {
  const { toast } = useToast();
  const members = useQuery<AdminMember[]>({ queryKey: ["/api/members"] });

  const blockMutation = useMutation({
    mutationFn: async ({ id, blocked }: { id: number; blocked: boolean }) =>
      apiRequest("POST", `/api/members/${id}/block`, { blocked }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      toast({ title: "Member updated" });
    },
    onError: (e: Error) => toast({ title: "Couldn't update member", description: e.message.replace(/^\d+:\s*/, ""), variant: "destructive" }),
  });

  return (
    <Card>
      <CardContent className="p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" />
          <div>
            <div className="font-semibold">Community Members</div>
            <p className="text-xs text-muted-foreground">Everyone who's signed in with a magic link. Block anyone who shouldn't be voting.</p>
          </div>
        </div>

        {!members.data ? (
          <div className="h-20 rounded-lg bg-muted animate-pulse" />
        ) : members.data.length === 0 ? (
          <div className="text-sm text-muted-foreground italic py-2">No members have signed in yet.</div>
        ) : (
          <div className="space-y-2">
            {members.data.map(m => (
              <div
                key={m.id}
                className="flex flex-wrap items-center gap-3 p-3 rounded-lg border border-card-border bg-card"
                data-testid={`row-member-${m.id}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate flex items-center gap-2">
                    {m.displayName || "(no name)"}
                    {m.blocked && <Badge variant="destructive" className="text-[10px]">Blocked</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{m.email}</div>
                </div>
                <Badge variant="secondary" className="text-[10px] shrink-0">
                  {m.voteCount} {m.voteCount === 1 ? "vote" : "votes"}
                </Badge>
                <Button
                  size="sm"
                  variant={m.blocked ? "secondary" : "ghost"}
                  onClick={() => blockMutation.mutate({ id: m.id, blocked: !m.blocked })}
                  disabled={blockMutation.isPending}
                  data-testid={`button-toggle-block-${m.id}`}
                >
                  {m.blocked ? (
                    <><ShieldCheck className="h-3.5 w-3.5 mr-1" /> Unblock</>
                  ) : (
                    <><ShieldOff className="h-3.5 w-3.5 mr-1" /> Block</>
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
