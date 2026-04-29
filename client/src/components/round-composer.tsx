import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { parseMatchups } from "@/lib/bracket";
import { useToast } from "@/hooks/use-toast";
import { Plus, Sparkles, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  albumId: number;
  round: number;
  /** Album tracklist — used to validate Round 1 entries. */
  tracks: string[];
  /** Songs allowed as input (e.g. winners of the previous round). */
  allowedSongs?: string[];
  /** Tip shown when the textarea is empty. */
  helperText?: string;
}

const PLACEHOLDER = `Paste matchups, one per line. For example:

A Pirate Looks at Forty vs Migration
Trying to Reason with Hurricane Season vs Tin Cup Chalice
Door Number Three vs Stories We Could Tell

The app accepts "Song A vs Song B" or "Song A | Song B".`;

export function RoundComposer({ albumId, round, tracks, allowedSongs, helperText }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(round === 1);
  const [text, setText] = useState("");

  // Live parse for inline preview / validation
  const parsed = parseMatchups(text, {
    // For Round 1 we validate against the album tracklist; later rounds against the previous round's winners.
    tracks: round === 1 ? tracks : undefined,
    allowedSongs,
  });
  const isValid = parsed.ok && (parsed as any).matchups.length > 0;

  const submit = useMutation({
    mutationFn: async () => {
      if (!parsed.ok) throw new Error(parsed.error);
      await apiRequest("POST", `/api/albums/${albumId}/bracket/round`, {
        round,
        matchups: parsed.matchups,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/albums", albumId, "bracket"] });
      queryClient.invalidateQueries({ queryKey: ["/api/album-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/albums", albumId, "status"] });
      toast({ title: `Round ${round} added`, description: `${(parsed as any).matchups?.length ?? 0} matchups created.` });
      setText("");
      setOpen(false);
    },
    onError: (e: any) => {
      toast({ title: "Could not add round", description: e?.message ?? "Try again.", variant: "destructive" });
    },
  });

  return (
    <Card className="border-dashed border-2 border-primary/40">
      <CardContent className="p-4 sm:p-5">
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between gap-2 text-left hover-elevate active-elevate rounded-md -m-1 p-1"
          data-testid={`button-toggle-round-composer-${round}`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-8 w-8 rounded-full sun-gradient flex items-center justify-center shrink-0">
              <Plus className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-sm truncate">Add Round {round}</div>
              <div className="text-xs text-muted-foreground truncate">
                {helperText ?? "Paste this round's matchups."}
              </div>
            </div>
          </div>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
        </button>

        {open && (
          <div className="mt-4 space-y-3">
            <Textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={PLACEHOLDER}
              rows={8}
              className="font-mono text-xs leading-relaxed"
              data-testid={`textarea-round-${round}`}
            />

            {/* Live preview / errors */}
            {text.trim().length > 0 && (
              parsed.ok ? (
                <div className="rounded-md border border-border bg-muted/40 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3" /> Preview · {(parsed as any).matchups.length} matchups
                  </div>
                  <ol className="space-y-1 text-xs">
                    {(parsed as any).matchups.map((mu: any, i: number) => (
                      <li key={i} className="flex items-baseline gap-2">
                        <span className="text-muted-foreground font-mono w-5 shrink-0">{i + 1}.</span>
                        <span className="flex-1 truncate">
                          <span className="font-medium">{mu.songA}</span>
                          <span className="text-muted-foreground mx-1.5">vs</span>
                          <span className="font-medium">{mu.songB}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <div className="text-xs text-destructive" data-testid={`error-round-${round}`}>{(parsed as any).error}</div>
                </div>
              )
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => submit.mutate()}
                disabled={!isValid || submit.isPending}
                data-testid={`button-save-round-${round}`}
              >
                {submit.isPending ? "Saving..." : `Save Round ${round}`}
              </Button>
              <Button variant="ghost" onClick={() => { setText(""); setOpen(false); }} data-testid={`button-cancel-round-${round}`}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
