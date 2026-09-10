process.env.TZ = "Asia/Hong_Kong";

import { vi } from "vitest";
import { authState } from "./auth-state";

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [],
    set: vi.fn(),
    get: vi.fn(),
  }),
}));

vi.mock("@/lib/auth/session", () => ({
  getOptionalAuthUser: async () => authState.user,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => authState.supabase,
}));

vi.mock("@/lib/auth/guard-member-persona-server", () => ({
  guardMemberPersonaPersonalFeatures: vi.fn(async () => ({
    allowed: true as const,
  })),
  MEMBER_PERSONA_FEATURES_BLOCKED_ERROR: "此功能僅限個人會員使用",
}));
