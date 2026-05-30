import { useRef, useState } from "react";
import { LogIn, LogOut, Mail, CheckCircle2, User, Pencil, Camera, Trash2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, assetUrl } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/**
 * The community sign-in control shown in the header.
 * - Signed out: a "Sign in" button that opens the magic-link request dialog.
 * - Signed in:  a dropdown showing the member's name with a sign-out option.
 */
export function MemberAuthButton() {
  const { member, isLoading } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const requestMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/member/request-link", {
        email: email.trim(),
      });
      return res.json() as Promise<{ ok: boolean; devLink?: string }>;
    },
    onSuccess: (data) => {
      setSent(true);
      setDevLink(data.devLink ?? null);
    },
    onError: (err: Error) => {
      toast({
        title: "Couldn't send link",
        description: err.message.replace(/^\d+:\s*/, ""),
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/member/logout");
    },
    onSuccess: () => {
      // Force an immediate refetch so the header updates without a page refresh.
      qc.refetchQueries({ queryKey: ["/api/auth/me"] });
      qc.invalidateQueries();
      toast({ title: "Signed out", description: "See you next round. Fins up." });
    },
  });

  const renameMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/member/profile", { displayName: editName.trim() });
    },
    onSuccess: () => {
      // Refetch auth (header name) and standings/anything showing names.
      qc.refetchQueries({ queryKey: ["/api/auth/me"] });
      qc.invalidateQueries();
      setEditOpen(false);
      toast({ title: "Name updated", description: "Your new name shows everywhere you've voted." });
    },
    onError: (err: Error) => {
      toast({
        title: "Couldn't update name",
        description: err.message.replace(/^\d+:\s*/, ""),
        variant: "destructive",
      });
    },
  });

  // Photo upload uses multipart form-data, so we hit the endpoint directly
  // (apiRequest only handles JSON bodies).
  async function uploadPhoto(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch(assetUrl("/api/member/photo")!, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.text()) || `${res.status}`);
      qc.refetchQueries({ queryKey: ["/api/auth/me"] });
      qc.invalidateQueries();
      toast({ title: "Photo updated", description: "Your avatar shows everywhere you've voted." });
    } catch (e: any) {
      toast({ title: "Upload failed", description: (e?.message ?? "Try a smaller image.").replace(/^\d+:\s*/, ""), variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function clearPhoto() {
    try {
      await apiRequest("DELETE", "/api/member/photo");
      qc.refetchQueries({ queryKey: ["/api/auth/me"] });
      qc.invalidateQueries();
      toast({ title: "Photo removed", description: "Back to your initial." });
    } catch (e: any) {
      toast({ title: "Could not remove photo", description: (e?.message ?? "").replace(/^\d+:\s*/, ""), variant: "destructive" });
    }
  }

  function resetDialog() {
    setSent(false);
    setDevLink(null);
    setEmail("");
  }

  if (isLoading) return null;

  if (member) {
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 gap-1.5 px-2.5"
              data-testid="button-member-menu"
            >
              {member.photoUrl ? (
                <span className="h-6 w-6 rounded-full overflow-hidden bg-muted ring-1 ring-black/5 flex items-center justify-center shrink-0">
                  <img src={assetUrl(member.photoUrl)} alt={member.displayName} className="h-full w-full object-cover" data-testid="img-member-avatar" />
                </span>
              ) : (
                <span className="h-6 w-6 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0">
                  <User className="h-3.5 w-3.5" />
                </span>
              )}
              <span className="text-sm font-medium max-w-[8rem] truncate hidden sm:inline" data-testid="text-member-name">
                {member.displayName}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="truncate">{member.displayName}</span>
              <span className="text-xs font-normal text-muted-foreground truncate">{member.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                setEditName(member.displayName);
                setEditOpen(true);
              }}
              data-testid="button-edit-name"
            >
              <Pencil className="h-4 w-4 mr-2" /> Edit profile
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => logoutMutation.mutate()}
              data-testid="button-member-logout"
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="h-4 w-4 mr-2" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Edit profile</DialogTitle>
              <DialogDescription>
                Your name and photo show on the OG Parrothead Madness standings. Changes update everywhere you've voted.
              </DialogDescription>
            </DialogHeader>

            {/* Avatar with upload / remove controls */}
            <div className="flex items-center gap-3">
              <div className="relative shrink-0">
                {member.photoUrl ? (
                  <span className="h-16 w-16 rounded-full overflow-hidden bg-muted ring-1 ring-black/5 flex items-center justify-center">
                    <img src={assetUrl(member.photoUrl)} alt={member.displayName} className="h-full w-full object-cover" data-testid="img-edit-avatar" />
                  </span>
                ) : (
                  <span className="h-16 w-16 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xl font-semibold">
                    {member.displayName.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  data-testid="input-member-photo"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadPhoto(f);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  data-testid="button-upload-photo"
                  className="gap-1.5"
                >
                  <Camera className="h-4 w-4" />
                  {uploading ? "Uploading…" : member.photoUrl ? "Change photo" : "Add photo"}
                </Button>
                {member.photoUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => clearPhoto()}
                    disabled={uploading}
                    data-testid="button-remove-photo"
                    className="gap-1.5 text-destructive focus:text-destructive justify-start"
                  >
                    <Trash2 className="h-4 w-4" /> Remove
                  </Button>
                )}
                <span className="text-[11px] text-muted-foreground">JPEG, PNG, WEBP or GIF · up to 6MB</span>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!editName.trim()) return;
                renameMutation.mutate();
              }}
              className="space-y-3"
            >
              <div className="space-y-1.5">
                <Label htmlFor="edit-member-name">Display name</Label>
                <Input
                  id="edit-member-name"
                  data-testid="input-edit-name"
                  placeholder="What should we call you?"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  disabled={renameMutation.isPending}
                  maxLength={60}
                  autoFocus
                />
              </div>
              <DialogFooter className="gap-2 sm:gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEditOpen(false)}
                  disabled={renameMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  data-testid="button-save-edit-name"
                  disabled={renameMutation.isPending || !editName.trim()}
                >
                  {renameMutation.isPending ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        data-testid="button-member-signin"
        className="h-9 gap-1.5"
      >
        <LogIn className="h-4 w-4" />
        <span className="hidden sm:inline">Sign in to vote</span>
        <span className="sm:hidden">Sign in</span>
      </Button>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) resetDialog();
        }}
      >
        <DialogContent className="sm:max-w-sm">
          {!sent ? (
            <>
              <DialogHeader>
                <DialogTitle>Sign in to vote</DialogTitle>
                <DialogDescription>
                  Enter your email and we'll send you a one-tap sign-in link. No password to remember.
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!email.trim()) return;
                  requestMutation.mutate();
                }}
                className="space-y-3"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="member-email">Email</Label>
                  <Input
                    id="member-email"
                    data-testid="input-member-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={requestMutation.isPending}
                    autoFocus
                  />
                </div>
                <DialogFooter className="gap-2 sm:gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setOpen(false)}
                    disabled={requestMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    data-testid="button-send-link"
                    disabled={requestMutation.isPending || !email.trim()}
                  >
                    <Mail className="h-4 w-4 mr-1.5" />
                    {requestMutation.isPending ? "Sending…" : "Email me a link"}
                  </Button>
                </DialogFooter>
              </form>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" /> Check your email
                </DialogTitle>
                <DialogDescription>
                  We sent a sign-in link to <strong className="text-foreground">{email}</strong>. Tap it to
                  start voting. The link works once and expires in 30 minutes.
                </DialogDescription>
              </DialogHeader>
              {devLink && (
                <div className="rounded-md border border-dashed border-border bg-muted/40 p-3 text-xs">
                  <div className="font-medium mb-1 text-muted-foreground">Dev mode — email isn't configured, so use this link:</div>
                  <a
                    href={devLink}
                    className="text-primary break-all underline"
                    data-testid="link-dev-magic"
                  >
                    {devLink}
                  </a>
                </div>
              )}
              <DialogFooter>
                <Button onClick={() => { setOpen(false); resetDialog(); }}>Done</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
