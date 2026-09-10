import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.hoisted(() => vi.fn());
const fromMock = vi.hoisted(() => vi.fn());
const insertMock = vi.hoisted(() => vi.fn());
const selectMock = vi.hoisted(() => vi.fn());
const eqMock = vi.hoisted(() => vi.fn());
const maybeSingleMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/env", () => ({
  isSupabaseConfigured: () => true,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: getUserMock,
    },
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: fromMock,
  }),
}));

import { upsertUserPushSubscription } from "@/app/actions/push-subscriptions";

function buildSelectChain(result: {
  data: { id: string } | null;
  error: { message: string } | null;
}) {
  maybeSingleMock.mockResolvedValueOnce(result);
  eqMock.mockReturnValue({ maybeSingle: maybeSingleMock, eq: eqMock });
  selectMock.mockReturnValue({ eq: eqMock });
  fromMock.mockReturnValueOnce({ select: selectMock });
}

function buildInsertChain(result: {
  data: { id: string } | null;
  error: { message: string } | null;
}) {
  const insertMaybeSingle = vi.fn().mockResolvedValue(result);
  const insertSelect = vi.fn().mockReturnValue({ maybeSingle: insertMaybeSingle });
  insertMock.mockReturnValue({ select: insertSelect });
  fromMock.mockReturnValueOnce({ insert: insertMock });
}

describe("upsertUserPushSubscription", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    fromMock.mockReset();
    insertMock.mockReset();
    selectMock.mockReset();
    eqMock.mockReset();
    maybeSingleMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("returns login error for guests", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const result = await upsertUserPushSubscription({
      onesignalSubscriptionId: "sub-1",
      optedIn: true,
    });

    expect(result).toEqual({ success: false, error: "請先登入" });
  });

  it("inserts subscription row for authenticated users", async () => {
    buildSelectChain({ data: null, error: null });
    buildInsertChain({ data: { id: "row-1" }, error: null });

    const result = await upsertUserPushSubscription({
      onesignalSubscriptionId: "sub-abc",
      onesignalUserId: "os-user-1",
      optedIn: true,
    });

    expect(result).toEqual({ success: true, data: { id: "row-1" } });
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        onesignal_subscription_id: "sub-abc",
        onesignal_user_id: "os-user-1",
        opted_in: true,
      }),
    );
  });
});
