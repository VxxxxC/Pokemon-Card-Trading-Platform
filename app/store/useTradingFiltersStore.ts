import { create } from "zustand";
import type {
  PersonaFilter,
  TabStatusFilter,
} from "@/lib/member-order/constants";

export const DEFAULT_MEMBER_TRADING_FILTERS = {
  tabStatus: "all" as TabStatusFilter,
  persona: "all" as PersonaFilter,
  searchQuery: "",
};

export const DEFAULT_MERCHANT_TRADING_FILTERS = {
  tabStatus: "all" as TabStatusFilter,
  searchQuery: "",
  includePaymentPending: true,
  includeAuthInProgress: true,
};

type MemberTradingFilters = typeof DEFAULT_MEMBER_TRADING_FILTERS;
type MerchantTradingFilters = typeof DEFAULT_MERCHANT_TRADING_FILTERS;

export function hasActiveMemberTradingFilters(
  state: MemberTradingFilters,
): boolean {
  return (
    state.tabStatus !== DEFAULT_MEMBER_TRADING_FILTERS.tabStatus ||
    state.persona !== DEFAULT_MEMBER_TRADING_FILTERS.persona ||
    state.searchQuery.trim().length > 0
  );
}

export function hasActiveMerchantTradingFilters(
  state: MerchantTradingFilters,
): boolean {
  return (
    state.tabStatus !== DEFAULT_MERCHANT_TRADING_FILTERS.tabStatus ||
    state.searchQuery.trim().length > 0 ||
    state.includePaymentPending !==
      DEFAULT_MERCHANT_TRADING_FILTERS.includePaymentPending ||
    state.includeAuthInProgress !==
      DEFAULT_MERCHANT_TRADING_FILTERS.includeAuthInProgress
  );
}

interface TradingFiltersStore {
  member: MemberTradingFilters;
  merchant: MerchantTradingFilters;
  setMemberTabStatus: (tabStatus: TabStatusFilter) => void;
  setMemberPersona: (persona: PersonaFilter) => void;
  setMemberSearchQuery: (searchQuery: string) => void;
  resetMemberFilters: () => void;
  setMerchantTabStatus: (tabStatus: TabStatusFilter) => void;
  setMerchantSearchQuery: (searchQuery: string) => void;
  setMerchantIncludePaymentPending: (includePaymentPending: boolean) => void;
  setMerchantIncludeAuthInProgress: (includeAuthInProgress: boolean) => void;
  resetMerchantFilters: () => void;
}

export const useTradingFiltersStore = create<TradingFiltersStore>((set) => ({
  member: { ...DEFAULT_MEMBER_TRADING_FILTERS },
  merchant: { ...DEFAULT_MERCHANT_TRADING_FILTERS },

  setMemberTabStatus: (tabStatus) =>
    set((state) => ({
      member: { ...state.member, tabStatus },
    })),

  setMemberPersona: (persona) =>
    set((state) => ({
      member: { ...state.member, persona },
    })),

  setMemberSearchQuery: (searchQuery) =>
    set((state) => ({
      member: { ...state.member, searchQuery },
    })),

  resetMemberFilters: () =>
    set(() => ({
      member: { ...DEFAULT_MEMBER_TRADING_FILTERS },
    })),

  setMerchantTabStatus: (tabStatus) =>
    set((state) => ({
      merchant: { ...state.merchant, tabStatus },
    })),

  setMerchantSearchQuery: (searchQuery) =>
    set((state) => ({
      merchant: { ...state.merchant, searchQuery },
    })),

  setMerchantIncludePaymentPending: (includePaymentPending) =>
    set((state) => ({
      merchant: { ...state.merchant, includePaymentPending },
    })),

  setMerchantIncludeAuthInProgress: (includeAuthInProgress) =>
    set((state) => ({
      merchant: { ...state.merchant, includeAuthInProgress },
    })),

  resetMerchantFilters: () =>
    set(() => ({
      merchant: { ...DEFAULT_MERCHANT_TRADING_FILTERS },
    })),
}));
