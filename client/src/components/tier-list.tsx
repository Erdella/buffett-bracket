import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import type { MyTiersData, TierGrade, TierItem } from "@/lib/types";
import { TIER_GRADES } from "@/lib/types";
import { TIER_STYLE, TIER_DESCRIPTION } from "@/lib/tier";
import { AlbumCover } from "@/components/album-cover";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Layers } from "lucide-react";

/**
 * Compact, mobile-first personal tier list. Members drag album covers between
 * S–F rows (desktop) OR tap a cover to pick a grade from a menu (works on
 * touch). Ungraded albums live in a tray at the bottom. Grades persist via the
 * same /api/community/rate endpoint used on the album page.
 */
export function TierList() {
  const { toast } = useToast();
  const [dragId, setDragId] = useState<number | null>(null);
  const [overRow, setOverRow] = useState<TierGrade | "unranked" | null>(null);

  const tiers = useQuery<MyTiersData>({ queryKey: ["/api/community/my-tiers"] });

  const rate = useMutation({
    mutationFn: async ({ albumId, grade }: { albumId: number; grade: TierGrade | null }) => {
      await apiRequest("POST", "/api/community/rate", { albumId, grade });
    },
    // Optimistic update so covers move instantly.
    onMutate: async ({ albumId, grade }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/community/my-tiers"] });
      const prev = queryClient.getQueryData<MyTiersData>(["/api/community/my-tiers"]);
      if (prev) {
        queryClient.setQueryData<MyTiersData>(["/api/community/my-tiers"], {
          ...prev,
          items: prev.items.map(it => it.albumId === albumId ? { ...it, grade } : it),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["/api/community/my-tiers"], ctx.prev);
      toast({ title: "Couldn't save that grade", description: "Please try again.", variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/community/my-tiers"] });
    },
  });

  const byGrade = useMemo(() => {
    const map: Record<string, TierItem[]> = { unranked: [] };
    for (const g of TIER_GRADES) map[g] = [];
    for (const it of tiers.data?.items ?? []) {
      if (it.grade && map[it.grade]) map[it.grade].push(it);
      else map.unranked.push(it);
    }
    return map;
  }, [tiers.data]);

  if (tiers.isLoading || !tiers.data) {
    return <div className="h-64 rounded-xl bg-muted animate-pulse" />;
  }

  const gradedCount = (tiers.data.items ?? []).filter(i => i.grade).length;

  function assign(albumId: number, grade: TierGrade | null) {
    const current = tiers.data?.items.find(i => i.albumId === albumId)?.grade ?? null;
    if (current === grade) return;
    rate.mutate({ albumId, grade });
  }

  function onDrop(grade: TierGrade | "unranked") {
    if (dragId != null) assign(dragId, grade === "unranked" ? null : grade);
    setDragId(null);
    setOverRow(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Layers className="h-5 w-5 text-muted-foreground" />
        <h2 className="font-display text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
          My Tier List
        </h2>
        <span className="text-sm font-normal text-muted-foreground">{gradedCount} of {tiers.data.items.length} rated</span>
      </div>
      <p className="text-xs text-muted-foreground -mt-1">
        Drag an album into a row, or tap a cover to set its grade. S is the top tier; F is the bottom.
      </p>

      <div className="overflow-hidden rounded-xl border border-card-border divide-y divide-border/60">
        {TIER_GRADES.map(g => (
          <TierRow
            key={g}
            grade={g}
            items={byGrade[g]}
            isOver={overRow === g}
            onDragOverRow={() => setOverRow(g)}
            onDropRow={() => onDrop(g)}
            onDragStart={setDragId}
            onAssign={assign}
          />
        ))}
      </div>

      {/* Unranked tray */}
      <div
        onDragOver={e => { e.preventDefault(); setOverRow("unranked"); }}
        onDrop={() => onDrop("unranked")}
        className={cn(
          "rounded-xl border border-dashed p-3 transition-colors",
          overRow === "unranked" ? "border-primary bg-primary/5" : "border-border",
        )}
        data-testid="tier-unranked"
      >
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
          Not rated yet ({byGrade.unranked.length})
        </div>
        {byGrade.unranked.length === 0 ? (
          <div className="text-xs text-muted-foreground italic py-2">Every album is rated. Nice work.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {byGrade.unranked.map(it => (
              <TierCover key={it.albumId} item={it} onDragStart={setDragId} onAssign={assign} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TierRow({
  grade, items, isOver, onDragOverRow, onDropRow, onDragStart, onAssign,
}: {
  grade: TierGrade;
  items: TierItem[];
  isOver: boolean;
  onDragOverRow: () => void;
  onDropRow: () => void;
  onDragStart: (albumId: number) => void;
  onAssign: (albumId: number, grade: TierGrade | null) => void;
}) {
  const style = TIER_STYLE[grade];
  return (
    <div className="flex items-stretch min-h-[64px]" data-testid={`tier-row-${grade}`}>
      {/* Colored grade label */}
      <div
        className={cn("w-12 sm:w-14 shrink-0 flex items-center justify-center font-display text-2xl font-extrabold", style.chip)}
        title={TIER_DESCRIPTION[grade]}
      >
        {grade}
      </div>
      {/* Drop zone with covers */}
      <div
        onDragOver={e => { e.preventDefault(); onDragOverRow(); }}
        onDrop={onDropRow}
        className={cn(
          "flex-1 min-w-0 flex flex-wrap gap-1.5 p-2 transition-colors",
          isOver ? "bg-primary/10" : "bg-card",
        )}
      >
        {items.map(it => (
          <TierCover key={it.albumId} item={it} onDragStart={onDragStart} onAssign={onAssign} />
        ))}
      </div>
    </div>
  );
}

function TierCover({
  item, onDragStart, onAssign,
}: {
  item: TierItem;
  onDragStart: (albumId: number) => void;
  onAssign: (albumId: number, grade: TierGrade | null) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          draggable
          onDragStart={() => onDragStart(item.albumId)}
          className="relative block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-grab active:cursor-grabbing"
          title={`${item.title} (${item.year})`}
          data-testid={`tier-cover-${item.albumId}`}
        >
          <AlbumCover album={item} sizeClass="h-12 w-12 sm:h-14 sm:w-14" roundedClass="rounded-md" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel className="truncate">{item.title}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {TIER_GRADES.map(g => (
          <DropdownMenuItem
            key={g}
            onClick={() => onAssign(item.albumId, g)}
            data-testid={`tier-set-${item.albumId}-${g}`}
            className="gap-2"
          >
            <span className={cn("inline-flex h-5 w-5 items-center justify-center rounded font-display font-bold text-xs", TIER_STYLE[g].chip)}>{g}</span>
            <span className="text-xs text-muted-foreground">{TIER_DESCRIPTION[g]}</span>
          </DropdownMenuItem>
        ))}
        {item.grade && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onAssign(item.albumId, null)} data-testid={`tier-remove-${item.albumId}`}>
              Remove rating
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/albums/${item.albumId}`} className="text-xs">Open album page</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
