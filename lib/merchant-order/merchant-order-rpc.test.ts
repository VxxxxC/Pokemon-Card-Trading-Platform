import { describe, expect, it } from "bun:test";
import { mapMerchantEscrowToMemberStatus } from "./merchant-order-rpc";

describe("mapMerchantEscrowToMemberStatus", () => {
  it("returns completed when buyer confirmed regardless of escrow", () => {
    expect(
      mapMerchantEscrowToMemberStatus(
        "authenticated",
        "2026-08-04T10:19:13.543+00:00",
      ),
    ).toBe("completed");
  });

  it("returns pending for authenticated without buyer confirm", () => {
    expect(mapMerchantEscrowToMemberStatus("authenticated", null)).toBe(
      "pending",
    );
  });

  it("returns completed for completed_and_transferred", () => {
    expect(
      mapMerchantEscrowToMemberStatus("completed_and_transferred", null),
    ).toBe("completed");
  });
});
