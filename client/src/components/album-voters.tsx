import { useQuery } from "@tanstack/react-query";
import type { Album, AlbumVoters as AlbumVotersData } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { MemberAvatar } from "@/components/member-avatar";
import { Users } from "lucide-react";

/**
 * A row of avatars for every OG member who has voted on this album (made a
 * bracket pick or set a favorite). Members with a photo show it; everyone else
 * shows their initials on a colored circle. Sits under the OG standings and
 * above the tracklist/favorites on the album page.
 */
export function AlbumVoters({ album }: { album: Album }) {
  const voters = useQuery<AlbumVotersData>({
    queryKey: ["/api/albums", album.id, "voters"],
    refetchInterval: 30_000,
  });

  if (!voters.data) {
    return <div className="h-20 rounded-xl bg-muted animate-pulse" />;
  }

  const { total, voters: list } = voters.data;

  return (
    <Card className="border-card-border">
      <CardContent className="p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-display font-bold text-base flex items-center gap-2" style={{ fontFamily: "var(--font-display)" }}>
            <Users className="h-4 w-4 text-primary" /> Voted
          </h3>
          <span className="text-xs text-muted-foreground" data-testid="text-voted-count">
            {total} {total === 1 ? "parrothead" : "parrotheads"}
          </span>
        </div>

        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground py-1">
            No one's weighed in on this album yet — be the first.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2" data-testid="list-voters">
            {list.map(v => (
              <MemberAvatar
                key={v.id}
                id={v.id}
                name={v.displayName}
                photoUrl={v.photoUrl}
                sizeClass="h-9 w-9"
                textSizeClass="text-sm"
                className="ring-2 ring-background"
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
