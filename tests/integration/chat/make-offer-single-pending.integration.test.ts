import { afterAll, describe, expect, it } from "vitest";
import { makeOffer } from "@/app/actions/offers";
import { DUPLICATE_PENDING_OFFER_ERROR } from "@/app/lib/chat/offerSystemMessageCopy";
import {
  clearSessionCache,
  getBuyerUserId,
  runAsBuyer,
  warmSession,
} from "../shared/auth-context";
import { hasBaseIntegrationEnv } from "../shared/env";
import { createServiceRoleClient } from "../shared/supabase-admin";

function readEnv(key: string): string | undefined {
  return process.env[key]?.trim() || undefined;
}

function hasMakeOfferIntegrationEnv(): boolean {
  return Boolean(
    hasBaseIntegrationEnv() &&
      readEnv("E2E_BUYER_ID") &&
      readEnv("E2E_SELLER_ID") &&
      readEnv("E2E_LISTING_ID"),
  );
}

async function resetListingTradingFixture(params: {
  listingId: string;
  buyerId: string;
  sellerId: string;
}) {
  const admin = createServiceRoleClient();
  const { error } = await admin.rpc("rpc_e2e_reset_listing_trading_fixture", {
    p_listing_id: params.listingId,
    p_buyer_id: params.buyerId,
    p_seller_id: params.sellerId,
  });

  if (error) {
    throw new Error(`reset fixture failed: ${error.message}`);
  }

  await admin
    .from("listings")
    .update({ status: "active" })
    .eq("id", params.listingId);
}

describe.skipIf(!hasMakeOfferIntegrationEnv())(
  "makeOffer single pending guard",
  () => {
    const listingId = readEnv("E2E_LISTING_ID")!;
    const sellerId = readEnv("E2E_SELLER_ID")!;
    let buyerId = "";

    afterAll(async () => {
      await clearSessionCache();
    });

    it("rejects a second pending offer for the same buyer and listing", async () => {
      await warmSession("buyer");
      buyerId = await getBuyerUserId();
      await resetListingTradingFixture({
        listingId,
        buyerId,
        sellerId,
      });

      const first = await runAsBuyer(async () => makeOffer(listingId, 299, false));
      expect(first.success).toBe(true);

      const second = await runAsBuyer(async () => makeOffer(listingId, 298, false));
      expect(second.success).toBe(false);
      if (!second.success) {
        expect(second.error).toContain(DUPLICATE_PENDING_OFFER_ERROR);
      }

      const admin = createServiceRoleClient();
      const { data: pendingRows, error } = await admin
        .from("offers")
        .select("id")
        .eq("listing_id", listingId)
        .eq("buyer_id", buyerId)
        .eq("status", "pending");

      expect(error).toBeNull();
      expect(pendingRows?.length).toBe(1);
    });
  },
);
