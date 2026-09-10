import { describe, expect, it } from "vitest";
import {
  DEFAULT_AUTH_FEE_HKD,
  buildAuthEscrowConfigValue,
  parseAuthFeeFromSettings,
  validateAuthFeeHkd,
} from "@/lib/platform/auth-escrow-config";

describe("auth-escrow-config", () => {
  it("parses valid auth fee from settings json", () => {
    expect(parseAuthFeeFromSettings({ auth_fee_hkd: 200 })).toBe(200);
  });

  it("falls back when fee out of range", () => {
    expect(parseAuthFeeFromSettings({ auth_fee_hkd: 10 })).toBe(
      DEFAULT_AUTH_FEE_HKD,
    );
  });

  it("validates admin input range", () => {
    expect(validateAuthFeeHkd(150)).toBeNull();
    expect(validateAuthFeeHkd(49)).not.toBeNull();
  });

  it("merges auth fee while preserving sf leg fee", () => {
    expect(
      buildAuthEscrowConfigValue({ sf_leg_fee_hkd: 35 }, 180),
    ).toEqual({
      sf_leg_fee_hkd: 35,
      auth_fee_hkd: 180,
    });
  });
});
