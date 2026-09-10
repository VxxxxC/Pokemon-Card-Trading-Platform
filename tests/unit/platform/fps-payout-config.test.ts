import { describe, expect, it } from "vitest";
import {
  computeFpsGrossPayoutHkd,
  computeFpsNetPayoutAmount,
  DEFAULT_FPS_MANUAL_TRANSFER_FEE_HKD,
  formatFpsManualTransferFeeLabel,
  resolveFpsManualTransferFeeHkd,
} from "@/lib/platform/fps-payout-config";

describe("fps-payout-config", () => {
  it("resolveFpsManualTransferFeeHkd returns default constant", () => {
    expect(resolveFpsManualTransferFeeHkd()).toBe(
      DEFAULT_FPS_MANUAL_TRANSFER_FEE_HKD,
    );
    expect(DEFAULT_FPS_MANUAL_TRANSFER_FEE_HKD).toBe(0);
  });

  it("computeFpsGrossPayoutHkd sums item and inbound", () => {
    expect(computeFpsGrossPayoutHkd(90, 30)).toBe(120);
    expect(computeFpsGrossPayoutHkd(90)).toBe(90);
  });

  it("computeFpsNetPayoutAmount with default fee returns gross", () => {
    expect(computeFpsNetPayoutAmount(100)).toBe(100);
  });

  it("computeFpsNetPayoutAmount with explicit fee deducts from gross", () => {
    expect(computeFpsNetPayoutAmount(100, 5)).toBe(95);
    expect(computeFpsNetPayoutAmount(3, 5)).toBe(0);
  });

  it("formatFpsManualTransferFeeLabel", () => {
    expect(formatFpsManualTransferFeeLabel(0)).toBe("免收");
    expect(formatFpsManualTransferFeeLabel(5)).toBe("HK$5");
  });
});
