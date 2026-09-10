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
  PHASE1_EMAIL_CATALOG,
  PHASE1_EVENT_IDS,
  PHASE1_TEMPLATE_KEYS,
} from "@/lib/notifications/email-phase1-registry";
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

describe("Phase 1 email gate", () => {
  beforeEach(() => {
    insertMock.mockReset();
    fromMock.mockReset();
  });

  it("catalog has unique event ids and template keys", () => {
    expect(PHASE1_EMAIL_CATALOG.length).toBeGreaterThanOrEqual(11);
    expect(new Set(PHASE1_EVENT_IDS).size).toBe(PHASE1_EVENT_IDS.length);
    expect(new Set(PHASE1_TEMPLATE_KEYS).size).toBe(PHASE1_TEMPLATE_KEYS.length);
  });

  it("renders every Phase 1 template with subject, html, and text", () => {
    for (const entry of PHASE1_EMAIL_CATALOG) {
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

  it("enqueues every Phase 1 catalog row into outbox", async () => {
    buildInsertChain({ data: { id: "outbox-gate" }, error: null });

    for (const entry of PHASE1_EMAIL_CATALOG) {
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
      const inserted = insertMock.mock.calls[0]?.[0] as {
        subject?: string;
        html_body?: string;
      };
      expect(inserted?.subject?.trim(), entry.eventId).not.toBe("");
      expect(inserted?.html_body?.trim(), entry.eventId).not.toBe("");
    }
  });
});
