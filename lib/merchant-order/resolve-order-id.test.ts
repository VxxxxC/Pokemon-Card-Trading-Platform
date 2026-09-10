import { describe, expect, test } from "bun:test";
import type { createClient } from "@/lib/supabase/server";
import {
  INVALID_MERCHANT_ORDER_ID_ERROR,
  resolveMerchantOrderIdForBuyer,
} from "./resolve-order-id";

const BUYER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORDER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type MockConfig = {
  orderById?: { id: string } | null;
  orderByNumber?: { id: string } | null;
};

type QueryState = {
  table: string;
  filters: Record<string, string | string[]>;
};

function resolveQuery(
  state: QueryState,
  config: MockConfig,
  mode: "single" | "array",
): { data: unknown; error: null } {
  if (state.table === "merchant_orders" && state.filters.id) {
    return { data: config.orderById ?? null, error: null };
  }
  if (state.table === "merchant_orders" && state.filters.order_number) {
    return { data: config.orderByNumber ?? null, error: null };
  }

  return { data: mode === "single" ? null : [], error: null };
}

function createMockSupabase(config: MockConfig) {
  const state: QueryState = { table: "", filters: {} };

  const builder = {
    select: () => builder,
    eq: (column: string, value: string) => {
      state.filters[column] = value;
      return builder;
    },
    maybeSingle: () => Promise.resolve(resolveQuery(state, config, "single")),
    then: (
      onFulfilled: (value: { data: unknown; error: null }) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) =>
      Promise.resolve(resolveQuery(state, config, "array")).then(
        onFulfilled,
        onRejected,
      ),
  };

  return {
    from: (table: string) => {
      state.table = table;
      state.filters = {};
      return builder;
    },
  } as unknown as Awaited<ReturnType<typeof createClient>>;
}

describe("resolveMerchantOrderIdForBuyer", () => {
  test("resolves merchant_orders.id UUID for buyer", async () => {
    const supabase = createMockSupabase({
      orderById: { id: ORDER_ID },
    });

    const result = await resolveMerchantOrderIdForBuyer(
      supabase,
      ORDER_ID,
      BUYER_ID,
    );

    expect(result).toEqual({ ok: true, id: ORDER_ID });
  });

  test("resolves ORD-* order number (case-insensitive)", async () => {
    const supabase = createMockSupabase({
      orderByNumber: { id: ORDER_ID },
    });

    const result = await resolveMerchantOrderIdForBuyer(
      supabase,
      "ord-2026-abc123",
      BUYER_ID,
    );

    expect(result).toEqual({ ok: true, id: ORDER_ID });
  });

  test("returns unified error for unknown identifiers", async () => {
    const supabase = createMockSupabase({
      orderById: null,
    });

    const result = await resolveMerchantOrderIdForBuyer(
      supabase,
      "not-a-real-order-key",
      BUYER_ID,
    );

    expect(result).toEqual({
      ok: false,
      error: INVALID_MERCHANT_ORDER_ID_ERROR,
    });
  });

  test("returns not-found for ORD-* with no matching order", async () => {
    const supabase = createMockSupabase({
      orderByNumber: null,
    });

    const result = await resolveMerchantOrderIdForBuyer(
      supabase,
      "ORD-2026-ZZZZZZ",
      BUYER_ID,
    );

    expect(result).toEqual({
      ok: false,
      error: "找不到指定的交易訂單記錄",
    });
  });
});
