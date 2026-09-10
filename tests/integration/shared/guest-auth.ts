import { authState } from "./auth-state";

export function setGuestServerClient(): void {
  authState.user = null;
  authState.supabase = {
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
    },
  } as unknown as typeof authState.supabase;
}

export function clearGuestServerClient(): void {
  authState.user = null;
  authState.supabase = null;
}
