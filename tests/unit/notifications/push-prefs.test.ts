import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: fromMock,
  }),
}));

import {
  isTransactionalPushEvent,
  isUserPushTransactionalEnabled,
} from "@/lib/notifications/push-prefs";

describe("push prefs", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("classifies transactional push events", () => {
    expect(isTransactionalPushEvent("P-OFF-01")).toBe(true);
    expect(isTransactionalPushEvent("P-ORD-02")).toBe(true);
    expect(isTransactionalPushEvent("P-GRD-C2C-01")).toBe(true);
    expect(isTransactionalPushEvent("P-WIS-01")).toBe(false);
    expect(isTransactionalPushEvent("P-CHT-01")).toBe(false);
  });

  it("defaults to enabled when profile row is missing", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    fromMock.mockReturnValue({ select });

    await expect(isUserPushTransactionalEnabled("user-1")).resolves.toBe(true);
  });

  it("returns false when push_transactional is disabled", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { push_transactional: false },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    fromMock.mockReturnValue({ select });

    await expect(isUserPushTransactionalEnabled("user-1")).resolves.toBe(false);
  });
});
