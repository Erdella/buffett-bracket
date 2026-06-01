import { useEffect, useState } from "react";
import type { Album } from "@/lib/types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlbumBracketEditor } from "@/components/album-bracket-editor";
import { AlbumFavoritePicker } from "@/components/album-favorite-picker";
import { AlbumVoters } from "@/components/album-voters";
import { CommunityBracket } from "@/components/community-bracket";
import { useAuth } from "@/hooks/use-auth";
import { Home, Users } from "lucide-react";

/**
 * The album "arena". Two audiences:
 *
 *  - FAMILY (admin or a member linked to a family player): a two-tab view
 *    keeping the closed 5-voter family bracket separate from OG community
 *    voting. The family bracket/winner lives ONLY here.
 *  - EVERYONE ELSE: the family tab is hidden entirely — they only see the OG
 *    Parrothead Madness bracket. No hint that a family bracket exists.
 *
 * Default tab (family view): Community when a member is signed in, Family otherwise.
 */
export function AlbumArena({ album }: { album: Album }) {
  const { member, isFamily, isLoading } = useAuth();
  const [tab, setTab] = useState<string>("family");
  // Track whether the user has manually chosen a tab so we don't override their
  // choice once auth resolves.
  const [userChose, setUserChose] = useState(false);

  useEffect(() => {
    if (isLoading || userChose) return;
    setTab(member ? "community" : "family");
  }, [member, isLoading, userChose]);

  // Outsiders (and signed-in non-family members) only ever see the OG bracket.
  if (!isFamily) {
    return (
      <div className="w-full space-y-6">
        <p className="text-sm text-muted-foreground">
          Parrothead Madness — fill out your own bracket and let the whole crew's picks crown a winner.
        </p>
        <CommunityBracket album={album} />
        <AlbumVoters album={album} />
        <AlbumFavoritePicker album={album} />
      </div>
    );
  }

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => { setUserChose(true); setTab(v); }}
      className="w-full"
    >
      <TabsList className="grid w-full grid-cols-2 max-w-md">
        <TabsTrigger value="family" data-testid="tab-family" className="gap-1.5">
          <Home className="h-4 w-4" /> Family
        </TabsTrigger>
        <TabsTrigger value="community" data-testid="tab-community" className="gap-1.5">
          <Users className="h-4 w-4" /> <span className="truncate">OG Parrothead Madness</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="family" className="mt-5 space-y-6">
        <p className="text-sm text-muted-foreground">
          The original family contest — five voters, one bracket. These results stand on their own.
        </p>
        <AlbumBracketEditor album={album} />
      </TabsContent>

      <TabsContent value="community" className="mt-5 space-y-6">
        <p className="text-sm text-muted-foreground">
          Parrothead Madness — fill out your own bracket and let the whole crew's picks crown a winner.
        </p>
        <CommunityBracket album={album} />
        <AlbumVoters album={album} />
        <AlbumFavoritePicker album={album} />
      </TabsContent>
    </Tabs>
  );
}
