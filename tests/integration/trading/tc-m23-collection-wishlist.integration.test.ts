import { afterAll, describe, expect, it } from "vitest";
import { getCollectionPageBootstrap } from "@/app/actions/collection";
import { getWishlistEntries, toggleWishlist } from "@/app/actions/wishlist";
import {
  clearSessionCache,
  runAsBuyer,
  warmSession,
} from "../shared/auth-context";
import { setGuestServerClient } from "../shared/guest-auth";
import { hasBaseIntegrationEnv } from "../shared/env";

describe("TC-M23 collection / wishlist — contract", () => {
  it("getCollectionPageBootstrap requires login", async () => {
    setGuestServerClient();

    const result = await getCollectionPageBootstrap();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("請先登入");
    }
  });

  it("toggleWishlist rejects missing product id", async () => {
    setGuestServerClient();

    const result = await toggleWishlist({
      productId: "",
      gradingCompany: "RAW",
      gradingScore: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("缺少商品識別碼");
    }
  });
});

describe.skipIf(!hasBaseIntegrationEnv())(
  "TC-M23 collection / wishlist — smoke",
  () => {
    afterAll(async () => {
      await clearSessionCache();
    });

    it("buyer can bootstrap collection page", async () => {
      await warmSession("buyer");

      const result = await runAsBuyer(async () =>
        getCollectionPageBootstrap({ page: 1, pageSize: 12 }),
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.summary).toBeDefined();
        expect(Array.isArray(result.data.page.entries)).toBe(true);
      }
    });

    it("buyer can load wishlist entries", async () => {
      await warmSession("buyer");

      const result = await runAsBuyer(async () => getWishlistEntries());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(Array.isArray(result.data)).toBe(true);
      }
    });
  },
);
