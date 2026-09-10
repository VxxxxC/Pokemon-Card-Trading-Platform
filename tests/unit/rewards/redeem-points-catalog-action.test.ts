import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  listPointsRedemptionCatalog,
  redeemPointsCatalogItem,
} from "@/app/actions/rewards";
import { guardMemberPersonaPersonalFeatures } from "@/lib/auth/guard-member-persona-server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

vi.mock("@/lib/supabase/env", () => ({
  isSupabaseConfigured: vi.fn(() => true),
}));

describe("points redemption catalog server actions — persona guard", () => {
  beforeEach(() => {
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
    vi.mocked(guardMemberPersonaPersonalFeatures).mockResolvedValue({
      allowed: true,
    });
  });

  it("I-G9 listPointsRedemptionCatalog denies merchant persona", async () => {
    vi.mocked(guardMemberPersonaPersonalFeatures).mockResolvedValueOnce({
      allowed: false,
      error: "此功能僅限個人會員使用",
    });

    const result = await listPointsRedemptionCatalog();

    expect(result).toEqual({
      success: false,
      error: "此功能僅限個人會員使用",
    });
  });

  it("I-G9 redeemPointsCatalogItem denies merchant persona", async () => {
    vi.mocked(guardMemberPersonaPersonalFeatures).mockResolvedValueOnce({
      allowed: false,
      error: "此功能僅限個人會員使用",
    });

    const result = await redeemPointsCatalogItem(
      "00000000-0000-4000-8000-000000000001",
    );

    expect(result).toEqual({
      success: false,
      error: "此功能僅限個人會員使用",
    });
  });
});
