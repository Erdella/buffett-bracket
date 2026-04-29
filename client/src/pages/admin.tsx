import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Album, Player, Settings, AlbumStatus } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus, Save, Lock } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

const PALETTE = [
  "#01696F", "#A12C7B", "#DA7101", "#006494", "#437A22",
  "#7A39BB", "#D19900", "#964219", "#A13544",
];

export default function Admin() {
  const { toast } = useToast();
  const { isAdmin, isLoading: authLoading } = useAuth();
  const albums = useQuery<Album[]>({ queryKey: ["/api/albums"] });
  const settings = useQuery<Settings>({ queryKey: ["/api/settings"] });
  const players = useQuery<Player[]>({ queryKey: ["/api/players"] });
  const statuses = useQuery<AlbumStatus[]>({ queryKey: ["/api/album-status"] });

  const setCurrent = useMutation({
    mutationFn: async (albumId: number | null) =>
      apiRequest("POST", "/api/settings/current-album", { albumId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/album-status"] });
      toast({ title: "Current album updated" });
    },
  });

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PALETTE[0]);
  const addPlayer = useMutation({
    mutationFn: async () => {
      if (!newName.trim()) return;
      await apiRequest("POST", "/api/players", { name: newName.trim(), color: newColor, orderIndex: (players.data?.length ?? 0) });
    },
    onSuccess: () => {
      setNewName("");
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      toast({ title: "Family member added" });
    },
  });

  const updatePlayer = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: Partial<Player> }) =>
      apiRequest("PATCH", `/api/players/${id}`, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/players"] }),
  });

  const deletePlayer = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/players/${id}`, undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/players"] }),
  });

  if (authLoading) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }
  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto py-12 text-center space-y-3">
        <Lock className="h-10 w-10 mx-auto text-muted-foreground" />
        <h1 className="font-display text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>Admin only</h1>
        <p className="text-sm text-muted-foreground">
          Tap the lock icon in the header to log in.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold" style={{ fontFamily: "var(--font-display)" }}>Admin</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage the current album and family members.</p>
      </div>

      {/* Current Album */}
      <Card>
        <CardContent className="p-5 sm:p-6 space-y-3">
          <div className="font-semibold">Current Album</div>
          <p className="text-xs text-muted-foreground">The album everyone is voting on right now.</p>
          {albums.data && (
            <Select
              value={settings.data?.currentAlbumId ? String(settings.data.currentAlbumId) : ""}
              onValueChange={(v) => setCurrent.mutate(v ? Number(v) : null)}
            >
              <SelectTrigger className="w-full sm:max-w-md" data-testid="select-current-album">
                <SelectValue placeholder="Pick an album..." />
              </SelectTrigger>
              <SelectContent>
                {albums.data.map(a => {
                  const st = statuses.data?.find(s => s.albumId === a.id);
                  return (
                    <SelectItem key={a.id} value={String(a.id)} data-testid={`option-album-${a.id}`}>
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{a.year}</span>
                        <span>{a.title}</span>
                        {st?.status === "completed" && <Badge variant="secondary" className="text-[9px] ml-1">Done</Badge>}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      {/* Players */}
      <Card>
        <CardContent className="p-5 sm:p-6 space-y-4">
          <div>
            <div className="font-semibold">Family Members</div>
            <p className="text-xs text-muted-foreground">Edit names, change colors, or remove a player.</p>
          </div>

          <div className="space-y-2">
            {players.data?.map(p => (
              <PlayerRow
                key={p.id}
                player={p}
                onSave={(patch) => updatePlayer.mutate({ id: p.id, patch })}
                onDelete={() => {
                  if (confirm(`Remove ${p.name}? This will delete their picks too.`)) {
                    deletePlayer.mutate(p.id);
                  }
                }}
              />
            ))}
          </div>

          <div className="pt-3 border-t border-border/60">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Add a new family member</div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Name"
                className="flex-1 min-w-[140px]"
                data-testid="input-new-player-name"
              />
              <ColorSwatches value={newColor} onChange={setNewColor} />
              <Button onClick={() => addPlayer.mutate()} disabled={!newName.trim() || addPlayer.isPending} data-testid="button-add-player">
                <Plus className="h-4 w-4 mr-1.5" /> Add
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PlayerRow({
  player, onSave, onDelete,
}: {
  player: Player;
  onSave: (patch: Partial<Player>) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(player.name);
  const [color, setColor] = useState(player.color);
  const dirty = name !== player.name || color !== player.color;

  return (
    <div className="flex flex-wrap items-center gap-2 p-2 rounded-lg border border-card-border bg-card" data-testid={`row-player-${player.id}`}>
      <div
        className="h-9 w-9 rounded-full flex items-center justify-center text-white font-semibold shrink-0"
        style={{ backgroundColor: color }}
      >
        {name.charAt(0).toUpperCase()}
      </div>
      <Input
        value={name}
        onChange={e => setName(e.target.value)}
        className="flex-1 min-w-[120px]"
        data-testid={`input-player-name-${player.id}`}
      />
      <ColorSwatches value={color} onChange={setColor} compact />
      {dirty && (
        <Button size="sm" variant="secondary" onClick={() => onSave({ name, color })} data-testid={`button-save-player-${player.id}`}>
          <Save className="h-3.5 w-3.5 mr-1" /> Save
        </Button>
      )}
      <Button size="icon" variant="ghost" onClick={onDelete} aria-label="Delete" data-testid={`button-delete-player-${player.id}`}>
        <Trash2 className="h-4 w-4 text-muted-foreground" />
      </Button>
    </div>
  );
}

function ColorSwatches({ value, onChange, compact }: { value: string; onChange: (c: string) => void; compact?: boolean }) {
  return (
    <div className={"flex flex-wrap gap-1 " + (compact ? "" : "")}>
      {PALETTE.map(c => (
        <button
          key={c}
          type="button"
          aria-label={`Color ${c}`}
          onClick={() => onChange(c)}
          className={"h-6 w-6 rounded-full border-2 transition-transform " + (value === c ? "border-foreground scale-110" : "border-transparent hover:scale-105")}
          style={{ backgroundColor: c }}
          data-testid={`button-color-${c}`}
        />
      ))}
    </div>
  );
}
