import { useQuery } from "@tanstack/react-query";
import type { MemberInfo } from "@/lib/types";

export interface AuthState {
  isAdmin: boolean;
  // True when the visitor is the admin, or a signed-in member whose email is
  // linked to a family player. Family-only content is hidden from everyone else.
  isFamily: boolean;
  authConfigured: boolean;
  member: MemberInfo | null;
  mailConfigured: boolean;
}

/**
 * Returns the current auth state.
 *
 * - `isAdmin` is true when the visitor has logged in as admin (single password).
 * - `authConfigured` is true when the server has an admin password hash set.
 * - `member` is the logged-in community member (magic-link), or null.
 * - `mailConfigured` is true when Resend is configured to actually send mail.
 *
 * Defaults to read-only / signed-out while the request is in flight.
 */
export function useAuth(): AuthState & { isLoading: boolean } {
  const q = useQuery<AuthState>({
    queryKey: ["/api/auth/me"],
    // Keep auth state fresh so the header reflects sign-in/out without a manual
    // page refresh. A short stale window lets invalidation refetch promptly.
    staleTime: 5_000,
  });
  return {
    isAdmin: q.data?.isAdmin ?? false,
    isFamily: q.data?.isFamily ?? false,
    authConfigured: q.data?.authConfigured ?? false,
    member: q.data?.member ?? null,
    mailConfigured: q.data?.mailConfigured ?? false,
    isLoading: q.isLoading,
  };
}
