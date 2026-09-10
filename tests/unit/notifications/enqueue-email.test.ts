import { beforeEach, describe, expect, it, vi } from "vitest";

const insertMock = vi.hoisted(() => vi.fn());
const fromMock = vi.hoisted(() => vi.fn());
const isEmailEnabledForUserMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: fromMock,
  }),
}));

vi.mock("@/lib/notifications/notification-prefs", () => ({
  isEmailEnabledForUser: isEmailEnabledForUserMock,
}));

import { enqueueTransactionalEmail } from "@/lib/notifications/enqueue-email";

function buildInsertChain(result: {
  data: { id: string } | null;
  error: { code?: string; message: string } | null;
}) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const select = vi.fn().mockReturnValue({ maybeSingle });
  insertMock.mockReturnValue({ select });
  fromMock.mockReturnValue({ insert: insertMock });
}

describe("enqueueTransactionalEmail", () => {
  beforeEach(() => {
    insertMock.mockReset();
    fromMock.mockReset();
    isEmailEnabledForUserMock.mockReset();
    isEmailEnabledForUserMock.mockResolvedValue(true);
  });

  it("inserts a rendered template row into outbox", async () => {
    buildInsertChain({ data: { id: "outbox-1" }, error: null });

    const result = await enqueueTransactionalEmail({
      eventId: "E-ACC-04",
      templateKey: "acc.password_changed",
      toEmail: "user@example.com",
      idempotencyKey: "E-ACC-04:user-1:1",
    });

    expect(result).toEqual({
      success: true,
      data: { id: "outbox-1", duplicate: false },
    });
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event_id: "E-ACC-04",
        template_key: "acc.password_changed",
        to_email: "user@example.com",
        subject: "您的密碼已更新",
      }),
    );
  });

  it("treats unique violations as duplicate enqueue", async () => {
    buildInsertChain({
      data: null,
      error: { code: "23505", message: "duplicate key value" },
    });

    const result = await enqueueTransactionalEmail({
      eventId: "E-ACC-04",
      templateKey: "acc.password_changed",
      toEmail: "user@example.com",
      idempotencyKey: "E-ACC-04:user-1:1",
    });

    expect(result).toEqual({
      success: true,
      data: { id: "E-ACC-04:user-1:1", duplicate: true },
    });
  });

  it("skips opt-outable email when recipient disabled preference", async () => {
    isEmailEnabledForUserMock.mockResolvedValue(false);

    const result = await enqueueTransactionalEmail({
      eventId: "E-ORD-01",
      templateKey: "order.payment_confirmed",
      toEmail: "user@example.com",
      recipientUserId: "user-1",
      idempotencyKey: "E-ORD-01:order-1:buyer",
      subject: "付款成功",
      html: "<p>ok</p>",
    });

    expect(result).toEqual({
      success: true,
      data: { id: "pref-skipped:E-ORD-01:order-1:buyer", duplicate: false },
    });
    expect(insertMock).not.toHaveBeenCalled();
  });
});
