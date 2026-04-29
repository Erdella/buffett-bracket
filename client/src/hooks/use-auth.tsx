import { useQuery } from "@tanstack/react-query";

export interface AuthState {
  isAdmin: boolean;
  authConfigured: boolean;
}

/**
 * Returns the current auth state.
 *
 * - `isAdmin` is true when the visitor has logged in as admin.
 * - `authConfigured` is true when the server has an admin password hash set.
 *   When false, login is disabled and the lock icon is hidden.
 *
 * Defaults to read-only (`isAdmin: false`) while the request is in flight,
 * which means edit affordances stay hidden during the brief loading flicker.
 */
export function useAuth(): AuthState & { isLoading: boolean } {
  const q = useQuery<AuthState>({
    queryKey: ["/api/auth/me"],
    staleTime: 30_000,
  });
  return {
    isAdmin: q.data?.isAdmin ?? false,
    authConfigured: q.data?.authConfigured ?? false,
    isLoading: q.isLoading,
  };
}
