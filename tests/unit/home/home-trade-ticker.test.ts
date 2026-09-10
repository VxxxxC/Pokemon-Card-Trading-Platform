import { describe, expect, it } from "vitest";
import { getHomeTickerFallbackItems } from "@/lib/home/home-ticker-fallback";
import { mapHomeTradeTickerRows } from "@/lib/home/load-home-ticker";

describe("home trade ticker", () => {
  it("maps completed trade rows to marquee items", () => {
    const items = mapHomeTradeTickerRows(
      [
        {
          trade_id: "11111111-1111-4111-8111-111111111111",
          card_code: "sv6a-109",
          product_name: "月亮伊布 ex SAR",
          price_hkd: 1900,
          completed_at: "2026-09-01T10:00:00.000Z",
        },
      ],
      8,
    );

    expect(items).toEqual([
      {
        id: "sv6a-109",
        name: "月亮伊布 ex SAR",
        price: 1900,
        delta: 0,
        direction: "up",
        kind: "trade",
      },
    ]);
  });

  it("provides non-charizard fallback demo rows", () => {
    const items = getHomeTickerFallbackItems();
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.kind === "trade")).toBe(true);
    expect(items.some((item) => item.id === "sv2a-182")).toBe(false);
    expect(items.some((item) => item.name.includes("Charizard"))).toBe(false);
    expect(items.some((item) => /[\u4e00-\u9fff]/.test(item.name))).toBe(true);
  });
});
