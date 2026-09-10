import { describe, expect, it } from "vitest";
import {
  mapAuthFeeRows,
  mapCommissionRows,
  mapGmvRows,
  mergeRecognizedRows,
  resolveGmvAmount,
  resolveOrderRecognitionAt,
} from "@/lib/admin-dashboard/order-aggregates";

describe("order-aggregates", () => {
  it("resolveGmvAmount prefers item_subtotal then final_price", () => {
    expect(resolveGmvAmount(500, 999)).toBe(500);
    expect(resolveGmvAmount(null, 999)).toBe(999);
    expect(resolveGmvAmount(null, null)).toBe(0);
  });

  it("resolveOrderRecognitionAt prefers buyer_confirmed_at", () => {
    expect(
      resolveOrderRecognitionAt("2026-01-15T00:00:00.000Z", "2026-02-01T00:00:00.000Z"),
    ).toBe("2026-01-15T00:00:00.000Z");
    expect(resolveOrderRecognitionAt(null, "2026-02-01T00:00:00.000Z")).toBe(
      "2026-02-01T00:00:00.000Z",
    );
  });

  it("mapGmvRows merges merchant and member completed rows", () => {
    const rows = mergeRecognizedRows(
      mapGmvRows([
        {
          item_subtotal: 100,
          final_price: 200,
          buyer_confirmed_at: "2026-03-01T00:00:00.000Z",
          updated_at: "2026-03-02T00:00:00.000Z",
        },
      ]),
      mapGmvRows([
        {
          item_subtotal: null,
          final_price: 300,
          buyer_confirmed_at: null,
          updated_at: "2026-03-03T00:00:00.000Z",
        },
      ]),
    );

    expect(rows).toEqual([
      { amount: 100, recognizedAt: "2026-03-01T00:00:00.000Z" },
      { amount: 300, recognizedAt: "2026-03-03T00:00:00.000Z" },
    ]);
  });

  it("mapCommissionRows only maps commission amounts", () => {
    const rows = mapCommissionRows([
      {
        commission_amount: 12.5,
        buyer_confirmed_at: "2026-04-01T00:00:00.000Z",
        updated_at: null,
      },
    ]);

    expect(rows).toEqual([
      { amount: 12.5, recognizedAt: "2026-04-01T00:00:00.000Z" },
    ]);
  });

  it("mapAuthFeeRows uses auth_fee_captured_at", () => {
    const rows = mapAuthFeeRows([
      { auth_fee: 150, auth_fee_captured_at: "2026-05-01T00:00:00.000Z" },
    ]);

    expect(rows).toEqual([
      { amount: 150, recognizedAt: "2026-05-01T00:00:00.000Z" },
    ]);
  });
});
