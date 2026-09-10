import { beforeEach, describe, expect, it, vi } from "vitest";

const sendPushToUserMock = vi.hoisted(() => vi.fn());
const fromMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/notifications/push-delivery", () => ({
  sendPushToUser: sendPushToUserMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: fromMock,
  }),
}));

import {
  sendModerationReportOutcomePushes,
  sendModerationSanctionPush,
} from "@/lib/notifications/moderation-push";

function mockCaseLookup(caseNumber = "MOD-001") {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: { case_number: caseNumber },
    error: null,
  });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  fromMock.mockReturnValueOnce({ select });
}

function mockReportsLookup(reporterIds: string[]) {
  const eq = vi.fn().mockResolvedValue({
    data: reporterIds.map((reporter_id) => ({ reporter_id })),
    error: null,
  });
  const select = vi.fn().mockReturnValue({ eq });
  fromMock.mockReturnValueOnce({ select });
}

describe("moderation push send wiring", () => {
  beforeEach(() => {
    sendPushToUserMock.mockReset();
    fromMock.mockReset();
    sendPushToUserMock.mockResolvedValue(undefined);
  });

  it("P-MOD-01 targets each reporter", async () => {
    mockCaseLookup();
    mockReportsLookup(["reporter-1", "reporter-2"]);

    await sendModerationReportOutcomePushes({
      caseId: "case-1",
      resolution: "upheld",
    });

    expect(sendPushToUserMock).toHaveBeenCalledTimes(2);
    expect(sendPushToUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "P-MOD-01",
        userId: "reporter-1",
        path: "/profile/user/trading",
      }),
    );
  });

  it("P-MOD-01 skips when notifyReporter is false", async () => {
    await sendModerationReportOutcomePushes({
      caseId: "case-1",
      resolution: "upheld",
      notifyReporter: false,
    });

    expect(sendPushToUserMock).not.toHaveBeenCalled();
  });

  it("P-MOD-02 targets sanctioned subject", async () => {
    mockCaseLookup();

    await sendModerationSanctionPush({
      caseId: "case-1",
      subjectUserId: "subject-1",
      sanctionType: "suspend",
    });

    expect(sendPushToUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "P-MOD-02",
        userId: "subject-1",
        path: "/profile/user/settings",
        body: expect.stringContaining("帳戶暫停"),
      }),
    );
  });
});
