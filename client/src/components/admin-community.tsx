import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Album, BracketMatch, CommunityRoundState, AdminMember } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Radio, Lock, Users, ShieldOff, ShieldCheck, Mail } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Admin controls for the Parrothead Madness community layer:
 *  - Open a round for community voting (pick album + round number)
 *  - Close the open round (locks community plurality winners into the bracket)
 *  - Manage members (block / unblock)
 */
export function AdminCommunity({ albums }: { albums: Album[] }) {
  const { toast } = useToast();

  const round = useQuery<CommunityRoundState>({ queryKey: ["/api/community/round"] });

  // Album currently selected in the picker (defaults to the open round's album).
  const [pickAlbumId, setPickAlbumId] = useState<number | null>(null);
  const activeAlbumId = pickAlbumId ?? round.data?.albumId ?? null;

  // Rounds available for the picked album come from its bracket matches.
  const bracket = useQuery<BracketMatch[]>({
    queryKey: ["/api/albums", activeAlbumId, "bracket"],
    enabled: !!activeAlbumId,
  });

  const [pickRound, setPickRound] = useState<number | null>(null);

  const rounds = Array.from(new Set((bracket.data ?? []).map(m => m.round))).sort((a, b) => a - b);
  const activeRound = pickRound ?? round.data?.round ?? rounds[0] ?? null;

  const openRound = useMutation({
    mutationFn: async () => {
      if (!activeAlbumId || activeRound == null) throw new Error("Pick an album and a round first.");
      return apiRequest("POST", "/api/community/round", {
        albumId: activeAlbumId,
        round: activeRound,
        isOpen: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/community/round"] });
      if (activeAlbumId) queryClient.invalidateQueries({ queryKey: ["/api/albums", activeAlbumId, "community"] });
      toast({ title: "Round is live", description: "The crew can vote now. Fins up. 🌴" });
    },
    onError: (e: Error) => toast({ title: "Couldn't open round", description: e.message.replace(/^\d+:\s*/, ""), variant: "destructive" }),
  });

  const closeRound = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/community/round/close", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/community/round"] });
      const aid = round.data?.albumId;
      if (aid) {
        queryClient.invalidateQueries({ queryKey: ["/api/albums", aid, "community"] });
        queryClient.invalidateQueries({ queryKey: ["/api/albums", aid, "bracket"] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/album-status"] });
      toast({ title: "Round closed", description: "Community winner locked into the bracket." });
    },
    onError: (e: Error) => toast({ title: "Couldn't close round", description: e.message.replace(/^\d+:\s*/, ""), variant: "destructive" }),
  });

  const isOpen = round.data?.isOpen ?? false;
  const openAlbum = albums.find(a => a.id === round.data?.albumId) ?? null;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <div className="font-semibold">Parrothead Madness — Community Round</div>
          </div>

          {/* Current status banner */}
          <div
            className={cn(
              "rounded-lg border p-3 flex items-center gap-3 text-sm",
              isOpen ? "border-primary/40 bg-primary/10" : "border-border bg-muted/40",
            )}
            data-testid="status-community-round"
          >
            {isOpen ? (
              <>
                <Radio className="h-4 w-4 text-primary shrink-0 animate-pulse" />
                <span>
                  <strong>Open:</strong> {openAlbum?.title ?? `Album #${round.data?.albumId}`} — Round {round.data?.round}.
                  The community can vote now.
                </span>
              </>
            ) : (
              <>
                <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">No community round is open right now.</span>
              </>
            )}
          </div>

          {/* Open a round */}
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Open a round for community voting
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Select
                value={activeAlbumId ? String(activeAlbumId) : ""}
                onValueChange={(v) => { setPickAlbumId(Number(v)); setPickRound(null); }}
              >
                <SelectTrigger data-testid="select-community-album">
                  <SelectValue placeholder="Pick an album..." />
                </SelectTrigger>
                <SelectContent>
                  {albums.map(a => (
                    <SelectItem key={a.id} value={String(a.id)} data-testid={`option-community-album-${a.id}`}>
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{a.year}</span>
                        <span>{a.title}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={activeRound != null ? String(activeRound) : ""}
                onValueChange={(v) => setPickRound(Number(v))}
                disabled={!activeAlbumId || rounds.length === 0}
              >
                <SelectTrigger data-testid="select-community-round">
                  <SelectValue placeholder={rounds.length ? "Pick a round..." : "No rounds yet"} />
                </SelectTrigger>
                <SelectContent>
                  {rounds.map(r => (
                    <SelectItem key={r} value={String(r)} data-testid={`option-community-round-${r}`}>
                      Round {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => openRound.mutate()}
                disabled={!activeAlbumId || activeRound == null || openRound.isPending}
                data-testid="button-open-community-round"
              >
                <Radio className="h-4 w-4 mr-1.5" /> {isOpen ? "Switch to this round" : "Open round"}
              </Button>
              {isOpen && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (confirm("Close the open round? This locks the community winner into the bracket for any match without a winner yet.")) {
                      closeRound.mutate();
                    }
                  }}
                  disabled={closeRound.isPending}
                  data-testid="button-close-community-round"
                >
                  <Lock className="h-4 w-4 mr-1.5" /> Close round & lock winner
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Closing a round tallies the community's votes and writes the plurality winner onto the bracket —
              but only for matches that don't already have a family-decided winner.
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
