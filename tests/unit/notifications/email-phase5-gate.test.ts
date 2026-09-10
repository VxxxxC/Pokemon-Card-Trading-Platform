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
  PHASE5_EMAIL_CATALOG,
  PHASE5_EVENT_IDS,
  PHASE5_TEMPLATE_KEYS,
} from "@/lib/notifications/email-phase5-registry";
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

describe("Phase 5 email gate", () => {
  beforeEach(() => {
    insertMock.mockReset();
    fromMock.mockReset();
  });

  it("catalog has unique event ids and template keys", () => {
    expect(PHASE5_EMAIL_CATALOG.length).toBe(4);
    expect(new Set(PHASE5_EVENT_IDS).size).toBe(PHASE5_EVENT_IDS.length);
    expect(new Set(PHASE5_TEMPLATE_KEYS).size).toBe(PHASE5_TEMPLATE_KEYS.length);
  });

  it("renders every Phase 5 template", () => {
    for (const entry of PHASE5_EMAIL_CATALOG) {
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

  it("enqueues every Phase 5 catalog row", async () => {
    for (const entry of PHASE5_EMAIL_CATALOG) {
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
    }
  });
});
