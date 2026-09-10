import { describe, expect, it } from "vitest";
import {
  classifyEmailEvent,
  classifyPushEvent,
} from "@/lib/notifications/notification-pref-catalog";

describe("notification pref catalog", () => {
  it("classifies transactional push events including grading", () => {
    expect(classifyPushEvent("P-OFF-01")).toBe("transactional");
    expect(classifyPushEvent("P-ORD-02")).toBe("transactional");
    expect(classifyPushEvent("P-GRD-C2C-01")).toBe("transactional");
    expect(classifyPushEvent("P-WIS-01")).toBe("market_alerts");
    expect(classifyPushEvent("P-CHT-01")).toBe("chat_digest");
    expect(classifyPushEvent("P-RWD-01")).toBe("rewards");
    expect(classifyPushEvent("P-MOD-02")).toBe("mandatory");
  });

  it("classifies email rewards and mandatory account events", () => {
    expect(classifyEmailEvent("E-ORD-01")).toBe("transactional");
    expect(classifyEmailEvent("E-GRD-C2C-01")).toBe("transactional");
    expect(classifyEmailEvent("E-RWD-01")).toBe("rewards");
    expect(classifyEmailEvent("E-ACC-04")).toBe("mandatory");
    expect(classifyEmailEvent("E-MOD-02")).toBe("mandatory");
  });
});
