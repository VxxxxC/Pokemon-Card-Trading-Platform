import { afterAll, describe, expect, it } from "vitest";
import { buyNowListing } from "@/app/actions/buy-now";
import {
  clearSessionCache,
  runAsBuyer,
  warmSession,
} from "../shared/auth-context";
import { setGuestServerClient } from "../shared/guest-auth";
import { hasBaseIntegrationEnv } from "../shared/env";

const FAKE_LISTING_UUID = "00000000-0000-4000-8000-000000000066";

describe("TC-M24 merchant buy-now — contract", () => {
  it("buyNowListing rejects empty listing id", async () => {
    const result = await buyNowListing("  ");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("找不到此商品掛單");
    }
  });

  it("buyNowListing requires login", async () => {
    setGuestServerClient();

    const result = await buyNowListing(FAKE_LISTING_UUID);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("請先登入");
    }
  });
});

describe.skipIf(!hasBaseIntegrationEnv())("TC-M24 merchant buy-now — smoke", () => {
  afterAll(async () => {
    await clearSessionCache();
  });

  it("buyer buyNowListing on unknown listing returns structured error", async () => {
    await warmSession("buyer");

    const result = await runAsBuyer(async () =>
      buyNowListing(FAKE_LISTING_UUID, false),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("找不到此商品掛單");
    }
  });
});
