import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const eqMock = vi.hoisted(() => vi.fn());
const fromMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/env", () => ({
  isSupabaseConfigured: () => true,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { updatePushTransactionalPreference } from "@/app/actions/push-preferences";

describe("updatePushTransactionalPreference", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    fromMock.mockReset();
    updateMock.mockReset();
    eqMock.mockReset();

    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    eqMock.mockResolvedValue({ error: null });
    updateMock.mockReturnValue({ eq: eqMock });
    fromMock.mockReturnValue({ update: updateMock });
  });

  it("requires login", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const result = await updatePushTransactionalPreference(false);

    expect(result).toEqual({ success: false, error: "請先登入" });
  });

  it("persists push_transactional on profiles", async () => {
    const result = await updatePushTransactionalPreference(false);

    expect(result).toEqual({ success: true });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ push_transactional: false }),
    );
    expect(eqMock).toHaveBeenCalledWith("id", "user-1");
  });
});
