import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

const insertMock = vi.hoisted(() => vi.fn());
const fromMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: fromMock,
  }),
}));

import { enqueueTransactionalEmail } from "@/lib/notifications/enqueue-email";
import {
  PHASE2_EMAIL_CATALOG,
  PHASE2_EVENT_IDS,
  PHASE2_TEMPLATE_KEYS,
} from "@/lib/notifications/email-phase2-registry";
import { renderEmailTemplate } from "@/lib/notifications/email-templates";

function buildInsertChain(result: {
  data: { id: string } | null;
  error: { code?: string; message: string } | null;
}) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const select = vi.fn().mockReturnValue({ maybeSingle });
  insertMock.mockReturnValue({ select });
  fromMock.mockReturnValue({ insert: insertMock });
}

describe("Phase 2 email gate", () => {
  beforeEach(() => {
    insertMock.mockReset();
    fromMock.mockReset();
  });

  it("catalog has unique event ids and template keys", () => {
    expect(PHASE2_EMAIL_CATALOG.length).toBe(10);
    expect(new Set(PHASE2_EVENT_IDS).size).toBe(PHASE2_EVENT_IDS.length);
    expect(new Set(PHASE2_TEMPLATE_KEYS).size).toBe(PHASE2_TEMPLATE_KEYS.length);
  });

  it("renders every Phase 2 template with subject, html, and text", () => {
    for (const entry of PHASE2_EMAIL_CATALOG) {
      const rendered = renderEmailTemplate({
        templateKey: entry.templateKey,
        payload: entry.samplePayload,
      });

      expect(rendered, entry.templateKey).not.toBeNull();
      expect(rendered?.subject.trim(), entry.templateKey).not.toBe("");
      expect(rendered?.html.trim(), entry.templateKey).not.toBe("");
      expect(rendered?.text?.trim(), entry.templateKey).not.toBe("");
    }
  });

  it("enqueues every Phase 2 catalog row into outbox", async () => {
    buildInsertChain({ data: { id: "outbox-gate" }, error: null });

    for (const entry of PHASE2_EMAIL_CATALOG) {
      insertMock.mockClear();
      fromMock.mockClear();
      buildInsertChain({ data: { id: `outbox-${entry.eventId}` }, error: null });

      const result = await enqueueTransactionalEmail({
        eventId: entry.eventId,
        templateKey: entry.templateKey,
        toEmail: "gate-test@example.com",
        idempotencyKey: entry.idempotencyKey,
        payload: entry.samplePayload,
      });

      expect(result.success, entry.eventId).toBe(true);
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          event_id: entry.eventId,
          template_key: entry.templateKey,
          to_email: "gate-test@example.com",
          idempotency_key: entry.idempotencyKey,
          status: "pending",
        }),
      );
    }
  });
});
