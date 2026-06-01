import { useState } from "react";
import { MemberAvatar } from "@/components/member-avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export interface StackVoter {
  id: number;
  displayName: string;
  photoUrl?: string | null;
}

/**
 * A compact, overlapping row of voter avatars. Shows up to `max` avatars, then a
 * "+N" chip for the rest. Tapping the stack (or the +N chip) opens a popover
 * listing every voter with their avatar and name. Built to live inline on a song
 * line, so it's small (h-6) and stops click events from bubbling to the row.
 */
export function AvatarStack({
  voters,
  max = 10,
  testId,
}: {
  voters: StackVoter[];
  max?: number;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  if (voters.length === 0) return null;

  const shown = voters.slice(0, max);
  const overflow = voters.length - shown.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          // Don't let a tap on the stack also toggle the song's favorite.
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(o => !o); }}
          className="relative flex items-center shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${voters.length} ${voters.length === 1 ? "voter" : "voters"} — show all`}
          data-testid={testId}
        >
          <div className="flex items-center -space-x-2">
            {shown.map(v => (
              <MemberAvatar
                key={v.id}
                id={v.id}
                name={v.displayName}
                photoUrl={v.photoUrl}
                sizeClass="h-6 w-6"
                textSizeClass="text-[10px]"
                className="ring-2 ring-background"
              />
            ))}
            {overflow > 0 && (
              <span
                className="relative z-10 flex items-center justify-center h-6 min-w-6 px-1 rounded-full bg-muted text-muted-foreground ring-2 ring-background text-[10px] font-semibold"
                data-testid={testId ? `${testId}-overflow` : undefined}
              >
                +{overflow}
              </span>
            )}
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-56 p-0"
        onClick={(e) => e.stopPropagation()}
        data-testid={testId ? `${testId}-popover` : undefined}
      >
        <div className="px-3 py-2 border-b border-border/60 text-xs font-semibold text-foreground">
          {voters.length} {voters.length === 1 ? "vote" : "votes"}
        </div>
        <ScrollArea className={cn(voters.length > 8 ? "h-64" : "")}>
          <ul className="py-1">
            {voters.map(v => (
              <li
                key={v.id}
                className="flex items-center gap-2 px-3 py-1.5 text-sm"
                data-testid={testId ? `${testId}-row-${v.id}` : undefined}
              >
                <MemberAvatar
                  id={v.id}
                  name={v.displayName}
                  photoUrl={v.photoUrl}
                  sizeClass="h-6 w-6"
                  textSizeClass="text-[10px]"
                />
                <span className="truncate">{v.displayName}</span>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
