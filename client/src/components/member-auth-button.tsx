import { useState } from "react";
import { LogIn, LogOut, Mail, CheckCircle2, User } from "lucide-react";
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
import { apiRequest } from "@/lib/queryClient";
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
  const [name, setName] = useState("");
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const requestMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/member/request-link", {
        email: email.trim(),
        displayName: name.trim() || undefined,
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
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      qc.invalidateQueries();
      toast({ title: "Signed out", description: "See you next round. Fins up." });
    },
  });

  function resetDialog() {
    setSent(false);
    setDevLink(null);
    setEmail("");
    setName("");
  }

  if (isLoading) return null;

  if (member) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5 px-2.5"
            data-testid="button-member-menu"
          >
            <span className="h-6 w-6 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0">
              <User className="h-3.5 w-3.5" />
            </span>
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
            onClick={() => logoutMutation.mutate()}
            data-testid="button-member-logout"
            className="text-destructive focus:text-destructive"
          >
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
                  <Label htmlFor="member-name">Display name</Label>
                  <Input
                    id="member-name"
                    data-testid="input-member-name"
                    placeholder="What should we call you?"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={requestMutation.isPending}
                    maxLength={60}
                  />
                </div>
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
