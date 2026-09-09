import { afterEach, describe, expect, test } from "bun:test";
import {
  DEFAULT_MEMBER_TRADING_FILTERS,
  DEFAULT_MERCHANT_TRADING_FILTERS,
  hasActiveMemberTradingFilters,
  hasActiveMerchantTradingFilters,
  useTradingFiltersStore,
} from "@/app/store/useTradingFiltersStore";

function resetTradingFiltersStore() {
  useTradingFiltersStore.setState({
    member: { ...DEFAULT_MEMBER_TRADING_FILTERS },
    merchant: { ...DEFAULT_MERCHANT_TRADING_FILTERS },
  });
}

describe("hasActiveMemberTradingFilters", () => {
  afterEach(() => {
    resetTradingFiltersStore();
  });

  test("defaults are inactive", () => {
    expect(hasActiveMemberTradingFilters(DEFAULT_MEMBER_TRADING_FILTERS)).toBe(
      false,
    );
  });

  test("status, persona, or search marks active", () => {
    expect(
      hasActiveMemberTradingFilters({
        ...DEFAULT_MEMBER_TRADING_FILTERS,
        tabStatus: "pending",
      }),
    ).toBe(true);
    expect(
      hasActiveMemberTradingFilters({
        ...DEFAULT_MEMBER_TRADING_FILTERS,
        persona: "buy",
      }),
    ).toBe(true);
    expect(
      hasActiveMemberTradingFilters({
        ...DEFAULT_MEMBER_TRADING_FILTERS,
        searchQuery: "pikachu",
      }),
    ).toBe(true);
  });
});

describe("hasActiveMerchantTradingFilters", () => {
  afterEach(() => {
    resetTradingFiltersStore();
  });

  test("defaults are inactive", () => {
    expect(
      hasActiveMerchantTradingFilters(DEFAULT_MERCHANT_TRADING_FILTERS),
    ).toBe(false);
  });

  test("unchecked pending sub-filters mark active", () => {
    expect(
      hasActiveMerchantTradingFilters({
        ...DEFAULT_MERCHANT_TRADING_FILTERS,
        includePaymentPending: false,
      }),
    ).toBe(true);
    expect(
      hasActiveMerchantTradingFilters({
        ...DEFAULT_MERCHANT_TRADING_FILTERS,
        includeAuthInProgress: false,
      }),
    ).toBe(true);
  });
});

describe("useTradingFiltersStore", () => {
  afterEach(() => {
    resetTradingFiltersStore();
  });

  test("resetMemberFilters restores defaults", () => {
    const store = useTradingFiltersStore.getState();
    store.setMemberTabStatus("pending");
    store.setMemberPersona("buy");
    store.setMemberSearchQuery("abc");

    useTradingFiltersStore.getState().resetMemberFilters();

    expect(useTradingFiltersStore.getState().member).toEqual(
      DEFAULT_MEMBER_TRADING_FILTERS,
    );
  });

  test("resetMerchantFilters restores defaults", () => {
    const store = useTradingFiltersStore.getState();
    store.setMerchantTabStatus("completed");
    store.setMerchantSearchQuery("order-1");
    store.setMerchantIncludePaymentPending(false);
    store.setMerchantIncludeAuthInProgress(false);

    useTradingFiltersStore.getState().resetMerchantFilters();

    expect(useTradingFiltersStore.getState().merchant).toEqual(
      DEFAULT_MERCHANT_TRADING_FILTERS,
    );
  });
});
