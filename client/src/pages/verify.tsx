import { useEffect, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

type State = "verifying" | "success" | "error";

/**
 * Magic-link landing page. The link points at /#/verify?token=...
 * We read the token from the hash query string, POST it to /api/member/verify,
 * then bounce to Now Playing on success.
 */
export default function Verify() {
  const [, navigate] = useLocation();
  const [, params] = useRoute<{ token: string }>("/verify/:token");
  const qc = useQueryClient();
  const [state, setState] = useState<State>("verifying");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const ran = useRef(false);

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
        setState("success");
        await qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
        // Brief pause so the user sees the success state, then go vote.
        setTimeout(() => navigate("/"), 1200);
      } catch (err: any) {
        setState("error");
        setMessage((err?.message ?? "").replace(/^\d+:\s*/, "") || "We couldn't verify this link.");
      }
    })();
  }, [navigate, qc, params]);

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
          {state === "success" && (
            <>
              <CheckCircle2 className="h-10 w-10 mx-auto text-primary" />
              <div className="font-display text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
                Welcome aboard{name ? `, ${name}` : ""}!
              </div>
              <p className="text-sm text-muted-foreground">Taking you to the current round…</p>
            </>
          )}
          {state === "error" && (
            <>
              <XCircle className="h-10 w-10 mx-auto text-destructive" />
              <div className="font-display text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
                Link didn't work
              </div>
              <p className="text-sm text-muted-foreground" data-testid="text-verify-error">{message}</p>
              <Button onClick={() => navigate("/")} data-testid="button-verify-home">Back to Now Playing</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
