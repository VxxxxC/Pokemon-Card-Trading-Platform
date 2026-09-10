import { afterAll, describe, expect, it } from "vitest";
import { listKycApplications } from "@/app/actions/admin-kyc";
import { clearSessionCache, runAsAdmin, warmSession } from "../shared/auth-context";
import { hasBaseIntegrationEnv } from "../shared/env";

describe.skipIf(!hasBaseIntegrationEnv())("Admin KYC review list (TC-M11 admin)", () => {
  afterAll(async () => {
    await clearSessionCache();
  });

  it("admin can list KYC applications by status", async () => {
    await warmSession("admin");

    for (const status of ["pending", "approved", "rejected"] as const) {
      const result = await runAsAdmin(async () =>
        listKycApplications({ status }),
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(Array.isArray(result.data)).toBe(true);
        for (const row of result.data) {
          expect(row.status).toBe(status);
        }
      }
    }
  });
});
