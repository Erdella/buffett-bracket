import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AppHeader } from "@/components/app-header";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import NowPlaying from "@/pages/now-playing";
import Albums from "@/pages/albums";
import AlbumDetail from "@/pages/album-detail";
import Results from "@/pages/results";
import Leaderboard from "@/pages/leaderboard";
import Admin from "@/pages/admin";
import Verify from "@/pages/verify";

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/now-playing" component={NowPlaying} />
      <Route path="/albums" component={Albums} />
      <Route path="/albums/:id" component={AlbumDetail} />
      <Route path="/results" component={Results} />
      <Route path="/leaderboard" component={Leaderboard} />
      <Route path="/admin" component={Admin} />
      <Route path="/verify/:token" component={Verify} />
      <Route path="/verify" component={Verify} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Router hook={useHashLocation}>
            <div className="min-h-screen flex flex-col">
              <AppHeader />
              <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-10">
                <AppRouter />
              </main>
              <footer className="border-t border-border/60 py-6 mt-10">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 text-xs text-muted-foreground text-center">
                  Fins up. 🌴 Parrothead Madness — a Jimmy Buffett song-by-song showdown.
                </div>
              </footer>
            </div>
          </Router>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
