import { useEffect, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

type State = "verifying" | "name" | "success" | "error";

/**
 * Magic-link landing page. The link points at /#/verify/<token>
 * We read the token from the hash path, POST it to /api/member/verify, then:
 *  - if this is a first-time signer who never chose a display name, ask for one,
 *  - otherwise bounce to their personal "My Brackets" dashboard.
 */
export default function Verify() {
  const [, navigate] = useLocation();
  const [, params] = useRoute<{ token: string }>("/verify/:token");
  const qc = useQueryClient();
  const [state, setState] = useState<State>("verifying");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const ran = useRef(false);

  // Force the header (and anything else reading auth) to reflect the new session
  // immediately, without a manual page refresh.
  //
  // The magic link usually opens in a FRESH tab (from the email client), where
  // the ["/api/auth/me"] query hasn't mounted yet. In that state
  // `refetchQueries` is a no-op (it only touches active queries), so the header
  // would keep showing "signed out" until the user manually refreshed. To avoid
  // that race we fetch /api/auth/me ourselves and seed the cache directly, then
  // also invalidate so any already-mounted consumers refetch.
  async function refreshAuth() {
    try {
      const res = await apiRequest("GET", "/api/auth/me");
      const data = await res.json();
      qc.setQueryData(["/api/auth/me"], data);
    } catch {
      // Best-effort: fall back to invalidation below.
    }
    await qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
  }

  function finishToHome() {
    setState("success");
    // Brief pause so the user sees the success state, then drop them on their
    // personal dashboard where they can see their progress and pick up brackets.
    setTimeout(() => navigate("/my-brackets"), 1000);
  }

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    // The token arrives as a path param: "#/verify/<token>". We prefer that
    // (it matches our route cleanly under wouter's hash router). For backward
    // compatibility we also fall back to an older "?token=" query-string form.
    let token: string | null = params?.token ?? null;
    if (!token) {
      const hash = window.location.hash; // e.g. "#/verify?token=..."
      const qIndex = hash.indexOf("?");
      token = qIndex >= 0 ? new URLSearchParams(hash.slice(qIndex + 1)).get("token") : null;
    }

    if (!token) {
      setState("error");
      setMessage("This link is missing its sign-in code. Request a new one.");
      return;
    }

    (async () => {
      try {
        const res = await apiRequest("POST", "/api/member/verify", { token });
        const data = await res.json();
        setName(data.member?.displayName ?? "");
        // Make sure the header reflects the new session right away.
        await refreshAuth();
        // First-time signer who never picked a name → prompt for one.
        if (data.member?.needsName) {
          setName(""); // start with an empty field rather than the email prefix
          setState("name");
        } else {
          finishToHome();
        }
      } catch (err: any) {
        setState("error");
        setMessage((err?.message ?? "").replace(/^\d+:\s*/, "") || "We couldn't verify this link.");
      }
    })();
  }, [navigate, qc, params]);

  async function saveName() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSavingName(true);
    try {
      await apiRequest("POST", "/api/member/profile", { displayName: trimmed });
      await refreshAuth();
      finishToHome();
    } catch {
      // If saving fails, don't trap the user — let them in anyway.
      finishToHome();
    } finally {
      setSavingName(false);
    }
  }

  return (
    <div className="max-w-md mx-auto pt-10">
      <Card className="border-card-border overflow-hidden">
        <div className="sun-gradient h-2 w-full" />
        <CardContent className="py-10 text-center space-y-4">
          {state === "verifying" && (
            <>
              <Loader2 className="h-10 w-10 mx-auto text-primary animate-spin" />
              <div className="font-display text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
                Signing you in…
              </div>
              <p className="text-sm text-muted-foreground">Hang tight, hauling in your sail.</p>
            </>
          )}
          {state === "name" && (
            <form
              className="space-y-4 text-left"
              onSubmit={(e) => {
                e.preventDefault();
                saveName();
              }}
            >
              <div className="text-center space-y-1">
                <CheckCircle2 className="h-10 w-10 mx-auto text-primary" />
                <div className="font-display text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
                  You're in!
                </div>
                <p className="text-sm text-muted-foreground">
                  What should we call you? This is the name shown on the OG Parrothead Madness standings.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="verify-name">Display name</Label>
                <Input
                  id="verify-name"
                  data-testid="input-verify-name"
                  placeholder="e.g. Captain Jon"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={savingName}
                  maxLength={60}
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => finishToHome()}
                  disabled={savingName}
                  data-testid="button-skip-name"
                >
                  Skip
                </Button>
                <Button
                  type="submit"
                  data-testid="button-save-name"
                  disabled={savingName || !name.trim()}
                >
                  {savingName ? "Saving…" : "Save name"}
                </Button>
              </div>
            </form>
          )}
          {state === "success" && (
            <>
              <CheckCircle2 className="h-10 w-10 mx-auto text-primary" />
              <div className="font-display text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
                Welcome aboard{name ? `, ${name}` : ""}!
              </div>
              <p className="text-sm text-muted-foreground">Taking you to your brackets…</p>
            </>
          )}
          {state === "error" && (
            <>
              <XCircle className="h-10 w-10 mx-auto text-destructive" />
              <div className="font-display text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
                Link didn't work
              </div>
              <p className="text-sm text-muted-foreground" data-testid="text-verify-error">{message}</p>
              <Button onClick={() => navigate("/")} data-testid="button-verify-home">Back to home</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
