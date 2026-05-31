import { Link, useLocation } from "wouter";
import { Moon, Sun, Menu, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BuffettLogo } from "@/components/logo";
import { useTheme } from "@/components/theme-provider";
import { AdminAuthButton } from "@/components/admin-auth-button";
import { MemberAuthButton } from "@/components/member-auth-button";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const PUBLIC_NAV = [
  { href: "/",            label: "Home" },
  { href: "/now-playing", label: "Now Playing" },
  { href: "/albums",      label: "Albums" },
  { href: "/results",     label: "Results" },
  { href: "/leaderboard", label: "Leaderboard" },
];
const ADMIN_NAV = [{ href: "/admin", label: "Admin" }];

export function AppHeader() {
  const [loc] = useLocation();
  const { theme, toggle } = useTheme();
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const NAV = isAdmin ? [...PUBLIC_NAV, ...ADMIN_NAV] : PUBLIC_NAV;

  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-background/80 border-b border-border/60">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2.5 hover-elevate active-elevate rounded-md px-2 py-1 -mx-2" data-testid="link-home">
          <BuffettLogo className="h-7 w-7 sm:h-8 sm:w-8 shrink-0" />
          <div className="leading-tight">
            <div className="font-display font-bold text-base sm:text-lg" style={{ fontFamily: "var(--font-display)" }}>Parrothead Madness</div>
            <div className="text-[10px] sm:text-xs text-muted-foreground -mt-0.5 hidden xs:block sm:block">A Jimmy Buffett song-by-song showdown</div>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {NAV.map(n => (
            <Link
              key={n.href}
              href={n.href}
              data-testid={`nav-${n.label.toLowerCase().replace(/\s+/g, "-")}`}
              className={cn(
                "text-sm px-3 py-1.5 rounded-md hover-elevate active-elevate transition-colors",
                loc === n.href ? "text-foreground font-semibold bg-accent" : "text-muted-foreground"
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          <MemberAuthButton />
          <AdminAuthButton />
          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            aria-label="Toggle theme"
            data-testid="button-theme-toggle"
            className="h-9 w-9"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden h-9 w-9"
            onClick={() => setOpen(o => !o)}
            aria-label="Open menu"
            data-testid="button-menu-toggle"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {open && (
        <div className="md:hidden border-t border-border/60 bg-background">
          <nav className="px-4 py-2 flex flex-col">
            {NAV.map(n => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                data-testid={`nav-mobile-${n.label.toLowerCase().replace(/\s+/g, "-")}`}
                className={cn(
                  "px-3 py-2.5 rounded-md text-sm hover-elevate active-elevate",
                  loc === n.href ? "text-foreground font-semibold bg-accent" : "text-muted-foreground"
                )}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
