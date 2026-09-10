import { describe, expect, it } from "vitest";
import { isFpsPayoutBlockedForComplete } from "@/lib/admin-payouts/fps-payout-guards";

describe("isFpsPayoutBlockedForComplete", () => {
  it("blocks pending status", () => {
    expect(
      isFpsPayoutBlockedForComplete({
        status: "pending",
        fpsId: "12345678",
        fpsName: "Seller",
      }),
    ).toBe(true);
  });

  it("blocks PENDING_FPS snapshot on ready status", () => {
    expect(
      isFpsPayoutBlockedForComplete({
        status: "ready",
        fpsId: "PENDING_FPS",
        fpsName: "Seller",
      }),
    ).toBe(true);
  });

  it("blocks PENDING_FPS_NAME snapshot on processing status", () => {
    expect(
      isFpsPayoutBlockedForComplete({
        status: "processing",
        fpsId: "12345678",
        fpsName: "PENDING_FPS_NAME",
      }),
    ).toBe(true);
  });

  it("allows ready rows with valid snapshots", () => {
    expect(
      isFpsPayoutBlockedForComplete({
        status: "ready",
        fpsId: "12345678",
        fpsName: "Seller Name",
      }),
    ).toBe(false);
  });
});
