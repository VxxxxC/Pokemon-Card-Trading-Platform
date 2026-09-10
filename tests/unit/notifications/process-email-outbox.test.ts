import { beforeEach, describe, expect, it, vi } from "vitest";

const sendTransactionalEmail = vi.hoisted(() => vi.fn());
const fromMock = vi.hoisted(() => vi.fn());
const updateEqMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/email/resend", () => ({
  sendTransactionalEmail,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: fromMock,
  }),
}));

import { processEmailOutboxBatch } from "@/lib/notifications/process-email-outbox";

function buildWorkerFromChain(rows: Array<Record<string, unknown>>) {
  const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
  const order = vi.fn().mockReturnValue({ limit });
  const lte = vi.fn().mockReturnValue({ order });
  const inFn = vi.fn().mockReturnValue({ lte });
  const select = vi.fn().mockReturnValue({ in: inFn });
  updateEqMock.mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq: updateEqMock });
  fromMock.mockReturnValue({ select, update });
}

describe("processEmailOutboxBatch", () => {
  beforeEach(() => {
    sendTransactionalEmail.mockReset();
    fromMock.mockReset();
    updateEqMock.mockReset();
  });

  it("marks rows sent when Resend succeeds", async () => {
    buildWorkerFromChain([
      {
        id: "row-1",
        to_email: "user@example.com",
        subject: "Test",
        html_body: "<p>hi</p>",
        text_body: "hi",
        attempts: 0,
        max_attempts: 5,
      },
    ]);
    sendTransactionalEmail.mockResolvedValue({
      success: true,
      messageId: "resend-1",
    });

    const result = await processEmailOutboxBatch();

    expect(result).toMatchObject({
      scanned: 1,
      sent: 1,
      failed: 0,
      dead: 0,
    });
    expect(sendTransactionalEmail).toHaveBeenCalledWith({
      to: "user@example.com",
      subject: "Test",
      html: "<p>hi</p>",
      text: "hi",
    });
    expect(updateEqMock).toHaveBeenCalledWith("id", "row-1");
  });

  it("schedules retry when Resend fails", async () => {
    buildWorkerFromChain([
      {
        id: "row-2",
        to_email: "user@example.com",
        subject: "Test",
        html_body: "<p>hi</p>",
        text_body: null,
        attempts: 0,
        max_attempts: 5,
      },
    ]);
    sendTransactionalEmail.mockResolvedValue({
      success: false,
      error: "rate limited",
    });

    const result = await processEmailOutboxBatch();

    expect(result).toMatchObject({
      scanned: 1,
      sent: 0,
      failed: 1,
      dead: 0,
    });
    expect(result.errors[0]).toContain("rate limited");
  });
});
