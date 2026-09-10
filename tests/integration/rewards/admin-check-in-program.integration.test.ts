import { afterAll, describe, expect, it } from "vitest";
import {
  getAdminCheckInProgram,
  upsertAdminCheckInProgram,
} from "@/app/actions/admin-check-in-program";
import {
  buildDefaultCheckInProgramForm,
  programRowToForm,
} from "@/lib/admin-check-in-program/parse-check-in-program";
import { clearSessionCache, runAsAdmin, warmSession } from "../shared/auth-context";
import { setGuestServerClient } from "../shared/guest-auth";
import { hasRewardsIntegrationEnv } from "../rewards/helpers/env";

describe("TC-M41 admin check-in program — contract", () => {
  it("getAdminCheckInProgram requires login", async () => {
    setGuestServerClient();

    const result = await getAdminCheckInProgram();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("請先登入");
    }
  });
});

describe.skipIf(!hasRewardsIntegrationEnv())(
  "TC-M41 admin check-in program — smoke",
  () => {
    let restoreForm: ReturnType<typeof buildDefaultCheckInProgramForm> | null =
      null;

    afterAll(async () => {
      if (restoreForm) {
        await runAsAdmin(async () => {
          await upsertAdminCheckInProgram(restoreForm!);
        });
      }
      await clearSessionCache();
    });

    it("admin can load check-in program and roundtrip upsert when seeded", async () => {
      await warmSession("admin");

      const loaded = await runAsAdmin(async () => getAdminCheckInProgram());
      if (!loaded.success) {
        expect(loaded.error).toMatch(/找不到簽到計劃|無法載入/);
        return;
      }

      restoreForm = programRowToForm(loaded.data);
      const nextForm = {
        ...restoreForm,
        daily_rewards: {
          ...restoreForm.daily_rewards,
          "1": (restoreForm.daily_rewards["1"] ?? 5) + 1,
        },
      };

      const saved = await runAsAdmin(async () =>
        upsertAdminCheckInProgram(nextForm),
      );
      expect(saved.success).toBe(true);
      if (!saved.success) {
        return;
      }

      expect(saved.data.daily_rewards["1"]).toBe(nextForm.daily_rewards["1"]);

      const reloaded = await runAsAdmin(async () => getAdminCheckInProgram());
      expect(reloaded.success).toBe(true);
      if (reloaded.success) {
        expect(reloaded.data.daily_rewards["1"]).toBe(nextForm.daily_rewards["1"]);
      }
    });
  },
);
