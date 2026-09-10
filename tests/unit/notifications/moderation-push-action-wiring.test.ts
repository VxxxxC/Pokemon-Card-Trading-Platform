import { beforeEach, describe, expect, it, vi } from "vitest";

const pushMocks = vi.hoisted(() => ({
  sendModerationReportOutcomePushes: vi.fn(),
  sendModerationSanctionPush: vi.fn(),
}));

const fromMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: fromMock,
  }),
}));

vi.mock("@/lib/notifications/moderation-push", () => ({
  sendModerationReportOutcomePushes: pushMocks.sendModerationReportOutcomePushes,
  sendModerationSanctionPush: pushMocks.sendModerationSanctionPush,
}));

vi.mock("@/lib/notifications/enqueue-email", () => ({
  enqueueTransactionalEmail: vi.fn().mockResolvedValue({
    success: true,
    data: { id: "outbox-1", duplicate: false },
  }),
}));

vi.mock("@/lib/notifications/resolve-auth-user-email", () => ({
  resolveAuthUserEmails: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("@/lib/auth/site-url", () => ({
  getSiteUrl: vi.fn().mockResolvedValue("https://cardvaulthk.com"),
}));

vi.mock("@/lib/notifications/account-emails", () => ({
  enqueueAccountBannedEmail: vi.fn().mockResolvedValue(undefined),
  enqueueAccountSanctionAppliedEmail: vi.fn().mockResolvedValue(undefined),
  enqueueAccountSuspendedEmail: vi.fn().mockResolvedValue(undefined),
}));

import {
  enqueueModerationReportOutcomeEmails,
  enqueueModerationResolveFollowUpEmails,
} from "@/lib/notifications/moderation-emails";

const CASE_ID = "11111111-1111-4111-8111-111111111111";

function mockCaseRow(subjectUserId = "subject-1") {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: { case_number: "MOD-001", subject_user_id: subjectUserId },
    error: null,
  });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  fromMock.mockReturnValueOnce({ select });
}

function mockReportsRows() {
  const eq = vi.fn().mockResolvedValue({
    data: [{ id: "report-1", reporter_id: "reporter-1" }],
    error: null,
  });
  const select = vi.fn().mockReturnValue({ eq });
  fromMock.mockReturnValueOnce({ select });
}

describe("moderation push action wiring (PR7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromMock.mockReset();
    for (const mock of Object.values(pushMocks)) {
      mock.mockResolvedValue(undefined);
    }
  });

  it("enqueueModerationReportOutcomeEmails triggers P-MOD-01 push", async () => {
    mockCaseRow();
    mockReportsRows();

    await enqueueModerationReportOutcomeEmails({
      caseId: CASE_ID,
      resolution: "upheld",
    });

    expect(pushMocks.sendModerationReportOutcomePushes).toHaveBeenCalledWith({
      caseId: CASE_ID,
      resolution: "upheld",
      notifyReporter: undefined,
    });
  });

  it("enqueueModerationResolveFollowUpEmails triggers P-MOD-02 push", async () => {
    mockCaseRow();

    await enqueueModerationResolveFollowUpEmails({
      caseId: CASE_ID,
      resolution: "upheld",
      sanction: { type: "suspend" },
    });

    expect(pushMocks.sendModerationSanctionPush).toHaveBeenCalledWith({
      caseId: CASE_ID,
      subjectUserId: "subject-1",
      sanctionType: "suspend",
    });
  });
});
