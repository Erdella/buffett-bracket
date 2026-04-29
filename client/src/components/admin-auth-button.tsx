import { useState } from "react";
import { Lock, LockOpen, LogOut } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function AdminAuthButton() {
  const { isAdmin, authConfigured, isLoading } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const loginMutation = useMutation({
    mutationFn: async (pw: string) => {
      const res = await apiRequest("POST", "/api/auth/login", { password: pw });
      return res.json();
    },
    onSuccess: () => {
      setOpen(false);
      setPassword("");
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Logged in", description: "Edit access unlocked." });
    },
    onError: (err: Error) => {
      toast({
        title: "Login failed",
        description: err.message.replace(/^\d+:\s*/, "") || "Wrong password.",
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Logged out", description: "Back to read-only." });
    },
  });

  // Hide entirely when auth isn't configured (e.g. local dev with no env var).
  if (isLoading || !authConfigured) return null;

  if (isAdmin) {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={() => logoutMutation.mutate()}
        aria-label="Log out of admin"
        data-testid="button-admin-logout"
        className="h-9 w-9 text-primary"
        title="Logged in as admin — click to log out"
        disabled={logoutMutation.isPending}
      >
        <LockOpen className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label="Admin login"
        data-testid="button-admin-login"
        className="h-9 w-9"
        title="Admin login"
      >
        <Lock className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setPassword(""); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Admin login</DialogTitle>
            <DialogDescription>
              Enter the admin password to unlock editing. Visitors stay read-only.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!password) return;
              loginMutation.mutate(password);
            }}
            className="space-y-3"
          >
            <div className="space-y-1.5">
              <Label htmlFor="admin-password">Password</Label>
              <Input
                id="admin-password"
                data-testid="input-admin-password"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loginMutation.isPending}
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={loginMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                data-testid="button-admin-submit"
                disabled={loginMutation.isPending || !password}
              >
                {loginMutation.isPending ? "Logging in…" : "Log in"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
