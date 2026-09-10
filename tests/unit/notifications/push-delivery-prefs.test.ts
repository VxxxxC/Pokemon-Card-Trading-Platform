import { beforeEach, describe, expect, it, vi } from "vitest";

const sendOneSignalPushMock = vi.hoisted(() => vi.fn());
const isUserPushPrefEnabledMock = vi.hoisted(() => vi.fn());
const fromMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/notifications/onesignal/send", () => ({
  sendOneSignalPush: sendOneSignalPushMock,
}));

vi.mock("@/lib/notifications/push-prefs", () => ({
  isUserPushPrefEnabled: isUserPushPrefEnabledMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: fromMock,
  }),
}));

import { sendPushToUser } from "@/lib/notifications/push-delivery";

describe("push delivery prefs gate", () => {
  beforeEach(() => {
    sendOneSignalPushMock.mockReset();
    isUserPushPrefEnabledMock.mockReset();
    fromMock.mockReset();
    isUserPushPrefEnabledMock.mockResolvedValue(true);
    sendOneSignalPushMock.mockResolvedValue({
      success: true,
      skipped: true,
      reason: "no_targets",
    });

    const eqSecond = vi.fn().mockResolvedValue({ data: [], error: null });
    const eqFirst = vi.fn().mockReturnValue({ eq: eqSecond });
    const select = vi.fn().mockReturnValue({ eq: eqFirst });
    fromMock.mockReturnValue({ select });
  });

  it("skips transactional push when user disabled preference", async () => {
    isUserPushPrefEnabledMock.mockResolvedValue(false);

    await sendPushToUser({
      eventId: "P-OFF-01",
      userId: "seller-1",
      heading: "收到新出價",
      body: "test",
      path: "/profile/user/trading",
    });

    expect(sendOneSignalPushMock).not.toHaveBeenCalled();
  });

  it("still evaluates delivery for mandatory events", async () => {
    await sendPushToUser({
      eventId: "P-MOD-02",
      userId: "user-1",
      heading: "帳號制裁",
      body: "test",
      path: "/profile/user/settings",
    });

    expect(isUserPushPrefEnabledMock).toHaveBeenCalledWith(
      "user-1",
      "P-MOD-02",
    );
    expect(sendOneSignalPushMock).toHaveBeenCalled();
  });
});
