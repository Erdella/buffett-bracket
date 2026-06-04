import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Album, AdminMember, AlbumSeeds } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { Users, ShieldOff, ShieldCheck, Mail, Trophy, ListOrdered, ChevronUp, ChevronDown, Save, RotateCcw, GripVertical, Eraser } from "lucide-react";
import { cn } from "@/lib/utils";

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
            <div className="font-semibold">The Original Parrothead Madness — How voting works</div>
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
              These Original Parrothead Madness results stay completely separate from the family bracket — both show side by
              side under the Family / The Original Parrothead Madness tabs on each album.
            </p>
          </div>
        </CardContent>
      </Card>

      <SeedingEditor albums={_albums} />

      <MemberManagement />
    </div>
  );
}

/**
 * Per-album community bracket SEEDING editor. The admin ranks an album's songs
 * seed 1 (best) -> seed N; the app builds the seeded play-in bracket from that
 * order. The live preview shows the resulting structure (prelims + main rounds)
 * so the admin can see exactly what members will fill out.
 */
function SeedingEditor({ albums }: { albums: Album[] }) {
  const { toast } = useToast();
  const sorted = [...albums].sort((a, b) => a.orderIndex - b.orderIndex);
  const [albumId, setAlbumId] = useState<number | null>(sorted[0]?.id ?? null);

  const seeds = useQuery<AlbumSeeds>({
    queryKey: ["/api/albums", albumId, "seeds"],
    enabled: albumId != null,
  });

  // Local working copy of the seed order so reordering feels instant.
  const [order, setOrder] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  // Drag-and-drop reordering state: the row currently being dragged and the row
  // it's hovering over (the drop target). Both are list indices.
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  useEffect(() => {
    if (seeds.data) {
      setOrder(seeds.data.seedOrder);
      setDirty(false);
    }
  }, [seeds.data]);

  const move = (idx: number, dir: -1 | 1) => {
    setOrder(prev => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
    setDirty(true);
  };

  // Move the song at `from` to position `to`, shifting the rest. Used by both
  // drag-and-drop drops and keyboard reordering.
  const moveTo = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    setOrder(prev => {
      if (from >= prev.length || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setDirty(true);
  };

  const handleDrop = () => {
    if (dragIdx != null && overIdx != null) moveTo(dragIdx, overIdx);
    setDragIdx(null);
    setOverIdx(null);
  };

  const saveMutation = useMutation({
    mutationFn: async (seedOrder: string[] | null) => {
      const res = await apiRequest("PUT", `/api/albums/${albumId}/seeds`, { seedOrder });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/albums", albumId, "seeds"] });
      queryClient.invalidateQueries({ queryKey: ["/api/albums", albumId, "my-bracket"] });
      queryClient.invalidateQueries({ queryKey: ["/api/albums", albumId, "community-standings"] });
      toast({ title: "Seeding saved", description: "The Original Parrothead Madness bracket now uses this order." });
    },
    onError: (e: Error) =>
      toast({ title: "Couldn't save seeding", description: e.message.replace(/^\d+:\s*/, ""), variant: "destructive" }),
  });

  // Preview the bracket structure for the CURRENT working order.
  const structure = describeStructure(order.length);

  return (
    <Card>
      <CardContent className="p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ListOrdered className="h-4 w-4 text-primary" />
          <div>
            <div className="font-semibold">The Original Parrothead Madness bracket seeding</div>
            <p className="text-xs text-muted-foreground">
              Rank each album's songs from best (seed 1) to worst. The app builds a seeded
              play-in bracket: top seeds wait in the main round, the lowest seeds play in first.
            </p>
          </div>
        </div>

        <div className="max-w-xs">
          <Select
            value={albumId != null ? String(albumId) : undefined}
            onValueChange={v => setAlbumId(Number(v))}
          >
            <SelectTrigger data-testid="select-seed-album">
              <SelectValue placeholder="Choose an album" />
            </SelectTrigger>
            <SelectContent>
              {sorted.map(a => (
                <SelectItem key={a.id} value={String(a.id)} data-testid={`option-seed-album-${a.id}`}>
                  {a.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Structure preview */}
        {order.length > 0 && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs space-y-1" data-testid="text-structure-preview">
            <div className="font-semibold text-foreground">{order.length} songs → {structure.label}</div>
            <div className="text-muted-foreground">{structure.detail}</div>
          </div>
        )}

        {seeds.isLoading ? (
          <div className="h-40 rounded-lg bg-muted animate-pulse" />
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Drag a row by its handle to reorder, or use the arrows. Seed 1 is the top of the list.
            </p>
            <ol className="space-y-1.5" data-testid="seed-list">
              {order.map((song, i) => {
                const isDragging = dragIdx === i;
                const isOver = overIdx === i && dragIdx !== null && dragIdx !== i;
                return (
                  <li
                    key={song}
                    draggable
                    onDragStart={(e) => {
                      setDragIdx(i);
                      e.dataTransfer.effectAllowed = "move";
                      // Firefox requires data to be set for dragging to start.
                      e.dataTransfer.setData("text/plain", song);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (overIdx !== i) setOverIdx(i);
                    }}
                    onDrop={(e) => { e.preventDefault(); handleDrop(); }}
                    onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                    className={cn(
                      "flex items-center gap-2 p-2 rounded-lg border bg-card transition-colors",
                      isOver ? "border-primary ring-1 ring-primary bg-primary/5" : "border-card-border",
                      isDragging && "opacity-50",
                    )}
                    data-testid={`seed-row-${i}`}
                  >
                    <span
                      className="shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/70 hover:text-foreground touch-none"
                      aria-hidden
                      data-testid={`seed-handle-${i}`}
                    >
                      <GripVertical className="h-4 w-4" />
                    </span>
                    <span className="text-xs font-mono text-muted-foreground w-7 shrink-0 text-right">#{i + 1}</span>
                    <span className="text-sm font-medium flex-1 min-w-0 truncate" data-testid={`seed-song-${i}`}>{song}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                        data-testid={`button-seed-up-${i}`}
                        aria-label={`Move ${song} up`}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        disabled={i === order.length - 1}
                        onClick={() => move(i, 1)}
                        data-testid={`button-seed-down-${i}`}
                        aria-label={`Move ${song} down`}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ol>
          </>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={() => saveMutation.mutate(order)}
            disabled={!dirty || saveMutation.isPending || order.length === 0}
            data-testid="button-save-seeds"
          >
            <Save className="h-4 w-4 mr-1" /> Save seeding
          </Button>
          <Button
            variant="ghost"
            onClick={() => saveMutation.mutate(null)}
            disabled={saveMutation.isPending || !seeds.data?.isCustom}
            data-testid="button-reset-seeds"
          >
            <RotateCcw className="h-4 w-4 mr-1" /> Reset to track order
          </Button>
          {seeds.data && (
            <span className="text-xs text-muted-foreground" data-testid="text-seed-source">
              {seeds.data.isCustom ? "Custom seeding" : "Default (track order)"}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Describe the seeded play-in structure for N songs (matches the server). */
function describeStructure(n: number): { label: string; detail: string } {
  if (n <= 1) return { label: "—", detail: "Need at least 2 songs for a bracket." };
  let M = 1;
  while (M * 2 <= n) M *= 2;
  const prelimGames = n - M;
  const directSeeds = M - prelimGames;
  const mainRounds = Math.round(Math.log2(M));
  const totalRounds = (prelimGames > 0 ? 1 : 0) + mainRounds;
  const mainNames = ["Championship", "Semifinals", "Quarterfinals", "Round of 16", "Round of 32"];
  // First main round name = the round with M/2 games.
  const firstMainGames = M / 2;
  const firstMainName =
    mainRounds <= mainNames.length ? mainNames[mainRounds - 1] : `Round of ${M}`;
  if (prelimGames === 0) {
    return {
      label: `${totalRounds} rounds, no prelims`,
      detail: `Starts at the ${firstMainName.toLowerCase()} (${firstMainGames} games), then on to the championship.`,
    };
  }
  return {
    label: `${prelimGames} prelim ${prelimGames === 1 ? "game" : "games"} + ${totalRounds - 1} main ${totalRounds - 1 === 1 ? "round" : "rounds"}`,
    detail: `Seeds 1–${directSeeds} go straight to the ${firstMainName.toLowerCase()}. The bottom ${prelimGames * 2} seeds play ${prelimGames} prelim ${prelimGames === 1 ? "game" : "games"} to join them (${firstMainGames} ${firstMainName.toLowerCase()} games total).`,
  };
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

  // Wipe one member's OG picks + favorites across every album (keeps account).
  const clearDataMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/members/${id}/clear-data`, undefined);
      return res.json() as Promise<{ removed: { picks: number; favorites: number } }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      // Their picks/favorites fed every album's standings + voter rows, so refresh broadly.
      queryClient.invalidateQueries({ queryKey: ["/api/community/leaderboard"] });
      queryClient.invalidateQueries();
      const { picks, favorites } = data.removed;
      toast({
        title: "Member data cleared",
        description: `Removed ${picks} bracket ${picks === 1 ? "pick" : "picks"} and ${favorites} favorite ${favorites === 1 ? "song" : "songs"}.`,
      });
    },
    onError: (e: Error) => toast({ title: "Couldn't clear data", description: e.message.replace(/^\d+:\s*/, ""), variant: "destructive" }),
  });

  return (
    <Card>
      <CardContent className="p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" />
          <div>
            <div className="font-semibold">The Original Parrothead Madness Members</div>
            <p className="text-xs text-muted-foreground">Everyone who's signed in with a magic link. Block anyone who shouldn't be voting, or wipe a member's picks to reset them.</p>
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
                <Badge
                  variant="secondary"
                  className="text-[10px] shrink-0"
                  title={`${m.pickCount} bracket picks + ${m.favoriteCount} favorite songs across ${m.albumsPlayed} ${m.albumsPlayed === 1 ? "album" : "albums"}`}
                  data-testid={`badge-member-votes-${m.id}`}
                >
                  {m.voteCount} {m.voteCount === 1 ? "vote" : "votes"}
                  {m.albumsPlayed > 0 && <span className="text-muted-foreground/80"> · {m.albumsPlayed} {m.albumsPlayed === 1 ? "album" : "albums"}</span>}
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
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={clearDataMutation.isPending || m.voteCount === 0}
                  onClick={() => {
                    if (confirm(`Delete ALL of ${m.displayName || m.email}'s Original Parrothead Madness picks and favorites across every album? This can't be undone. Their account stays, so they can play again.`)) {
                      clearDataMutation.mutate(m.id);
                    }
                  }}
                  data-testid={`button-clear-member-${m.id}`}
                >
                  <Eraser className="h-3.5 w-3.5 mr-1" /> Delete data
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
