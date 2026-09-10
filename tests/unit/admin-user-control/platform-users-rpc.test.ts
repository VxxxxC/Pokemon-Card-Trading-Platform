import { describe, expect, it } from "vitest";
import { mapRpcRowToPlatformUserRow } from "@/lib/admin-user-control/platform-users-rpc";

describe("mapRpcRowToPlatformUserRow", () => {
  it("maps merchant rows with member persona fields", () => {
    const row = mapRpcRowToPlatformUserRow(
      {
        id: "user-1",
        role: "merchant",
        display_name: "E2E Member",
        username: "vitest_user",
        updated_at: "2026-08-27T18:11:00.000Z",
        shop_name: "TST TGC",
        shop_handle: "shop_handle",
        stripe_account_id: "acct_123",
        application_id: null,
        rep_email: "test@example.com",
        ui_kyc_status: "verified",
      },
      "test@example.com",
    );

    expect(row.userType).toBe("merchant");
    expect(row.name).toBe("TST TGC");
    expect(row.handle).toBe("@shop_handle");
    expect(row.memberName).toBe("E2E Member");
    expect(row.memberHandle).toBe("@vitest_user");
  });

  it("maps member rows without member persona fields", () => {
    const row = mapRpcRowToPlatformUserRow(
      {
        id: "user-2",
        role: "member",
        display_name: "Plain Member",
        username: "plain_user",
        updated_at: "2026-08-27T18:11:00.000Z",
        shop_name: null,
        shop_handle: null,
        stripe_account_id: null,
        application_id: null,
        rep_email: null,
        ui_kyc_status: null,
      },
      "member@example.com",
    );

    expect(row.userType).toBe("member");
    expect(row.name).toBe("Plain Member");
    expect(row.handle).toBe("@plain_user");
    expect(row.memberName).toBeNull();
    expect(row.memberHandle).toBeNull();
  });
});
