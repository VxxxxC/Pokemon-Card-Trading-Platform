import { create } from "zustand";
import { toast } from "sonner";
import type { ExecutionSlideOverPayload } from "@/lib/marketplace/map-listing-to-execution";
import { MEMBER_PERSONA_FEATURES_BLOCKED_ERROR } from "@/lib/auth/member-persona-features";
import {
  clearPersistedListingPersona,
  persistActiveListingPersona,
  resolveAddAssetSellerPersona,
  type ListingSellerPersona,
} from "@/lib/listings/active-listing-persona";

export type { ListingSellerPersona } from "@/lib/listings/active-listing-persona";
export { resolveAddAssetSellerPersona } from "@/lib/listings/active-listing-persona";

export type AuthRole = "GUEST" | "USER" | "MERCHANT" | "ADMIN";

import type { SealedProductScore } from "@/lib/catalog/item-kind";

export type SellFromCollectionPrefill = {
  collectionId: string;
  productId: string;
  itemKind?: "card" | "box_set";
  sealState?: SealedProductScore;
  catalog: {
    name: string;
    displayId?: string | null;
    cardNumber?: string | null;
    setCode: string;
    imageUrl?: string | null;
    rarity?: string | null;
    catalogType?: import("@/lib/constants/commerce").CatalogType;
  };
  gradingOptionId: string;
  sellingPrice: number;
};

export type OpenAddAssetModalInput = {
  mode: "hobby" | "merch";
  sellPrefill?: SellFromCollectionPrefill | null;
  sellerPersona?: ListingSellerPersona;
};

interface UIStore {
  isAddAssetOpen: boolean;
  addAssetMode: "hobby" | "merch";
  addAssetSellPrefill: SellFromCollectionPrefill | null;
  addAssetSellerPersona: ListingSellerPersona;
  activeListingPersona: ListingSellerPersona;
  userAuthRole: AuthRole;
  isIosPwaModalOpen: boolean;
  isExecutionSlideOverOpen: boolean;
  executionSlideOverPayload: ExecutionSlideOverPayload | null;
  openAddAssetModal: (input: OpenAddAssetModalInput) => void;
  closeAddAssetModal: () => void;
  setActiveListingPersona: (persona: ListingSellerPersona) => void;
  setUserAuthRole: (role: AuthRole) => void;
  openIosPwaModal: () => void;
  closeIosPwaModal: () => void;
  openExecutionSlideOver: (payload: ExecutionSlideOverPayload) => void;
  closeExecutionSlideOver: () => void;
}

export const useUIStore = create<UIStore>((set, get) => ({
  isAddAssetOpen: false,
  addAssetMode: "hobby",
  addAssetSellPrefill: null,
  addAssetSellerPersona: "member",
  // Always "member" on first paint — matches SSR. ActiveListingPersonaSync restores persisted persona after hydration.
  activeListingPersona: "member",
  userAuthRole: "GUEST",
  isIosPwaModalOpen: false,
  isExecutionSlideOverOpen: false,
  executionSlideOverPayload: null,
  openAddAssetModal: (input) => {
    const sellPrefill = input.sellPrefill ?? null;
    const activeListingPersona = get().activeListingPersona;
    if (!sellPrefill && input.mode === "hobby" && activeListingPersona === "merchant") {
      toast.error(MEMBER_PERSONA_FEATURES_BLOCKED_ERROR);
      return;
    }
    const sellerPersona = resolveAddAssetSellerPersona({
      sellPrefill,
      sellerPersona: input.sellerPersona,
      activeListingPersona: get().activeListingPersona,
    });
    set({
      isAddAssetOpen: true,
      addAssetMode: sellPrefill ? "merch" : input.mode,
      addAssetSellPrefill: sellPrefill,
      addAssetSellerPersona: sellerPersona,
    });
  },
  closeAddAssetModal: () =>
    set({
      isAddAssetOpen: false,
      addAssetSellPrefill: null,
      addAssetSellerPersona: "member",
    }),
  setActiveListingPersona: (persona) => {
    persistActiveListingPersona(persona);
    set({ activeListingPersona: persona });
  },
  setUserAuthRole: (role) => {
    if (role === "GUEST") {
      clearPersistedListingPersona();
    }
    set({ userAuthRole: role });
  },
  openIosPwaModal: () => set({ isIosPwaModalOpen: true }),
  closeIosPwaModal: () => set({ isIosPwaModalOpen: false }),
  openExecutionSlideOver: (payload) =>
    set({
      isExecutionSlideOverOpen: true,
      executionSlideOverPayload: payload,
    }),
  closeExecutionSlideOver: () =>
    set({
      isExecutionSlideOverOpen: false,
      executionSlideOverPayload: null,
    }),
}));
