import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getPlatformPrivacyForDisplay,
  getPlatformTermsForDisplay,
} from "@/app/actions/platform-legal";
import {
  DEFAULT_PLATFORM_PRIVACY,
  DEFAULT_PLATFORM_TERMS,
  PLATFORM_PRIVACY_CONFIG_KEY,
  PLATFORM_TERMS_CONFIG_KEY,
} from "@/lib/platform/platform-legal-config";
import { hasBaseIntegrationEnv } from "../shared/env";
import { clearSessionCache, runAsBuyer, warmSession } from "../shared/auth-context";
import { createServiceRoleClient } from "../shared/supabase-admin";

describe.skipIf(!hasBaseIntegrationEnv()).sequential(
  "platform legal documents SSOT integration",
  () => {
    const admin = createServiceRoleClient();
    let originalTerms: { value: unknown; updated_at: string | null } | null =
      null;
    let originalPrivacy: { value: unknown; updated_at: string | null } | null =
      null;

    const termsSnippet = "INTEGRATION_TEST_TERMS_SNIPPET_20260921";
    const privacySnippet = "INTEGRATION_TEST_PRIVACY_SNIPPET_20260921";

    beforeAll(async () => {
      await warmSession("buyer");

      const [termsRow, privacyRow] = await Promise.all([
        admin
          .from("platform_settings")
          .select("value, updated_at")
          .eq("key", PLATFORM_TERMS_CONFIG_KEY)
          .maybeSingle(),
        admin
          .from("platform_settings")
          .select("value, updated_at")
          .eq("key", PLATFORM_PRIVACY_CONFIG_KEY)
          .maybeSingle(),
      ]);

      originalTerms = termsRow.data ?? null;
      originalPrivacy = privacyRow.data ?? null;

      const now = new Date().toISOString();
      const { error: termsError } = await admin.from("platform_settings").upsert(
        {
          key: PLATFORM_TERMS_CONFIG_KEY,
          value: {
            title: DEFAULT_PLATFORM_TERMS.title,
            body: `${DEFAULT_PLATFORM_TERMS.body}\n\n${termsSnippet}`,
          },
          updated_at: now,
        },
        { onConflict: "key" },
      );
      expect(termsError).toBeNull();

      const { error: privacyError } = await admin
        .from("platform_settings")
        .upsert(
          {
            key: PLATFORM_PRIVACY_CONFIG_KEY,
            value: {
              title: DEFAULT_PLATFORM_PRIVACY.title,
              body: `${DEFAULT_PLATFORM_PRIVACY.body}\n\n${privacySnippet}`,
            },
            updated_at: now,
          },
          { onConflict: "key" },
        );
      expect(privacyError).toBeNull();
    });

    afterAll(async () => {
      if (originalTerms) {
        await admin.from("platform_settings").upsert(
          {
            key: PLATFORM_TERMS_CONFIG_KEY,
            value: originalTerms.value,
            updated_at: originalTerms.updated_at ?? new Date().toISOString(),
          },
          { onConflict: "key" },
        );
      } else {
        await admin
          .from("platform_settings")
          .delete()
          .eq("key", PLATFORM_TERMS_CONFIG_KEY);
      }

      if (originalPrivacy) {
        await admin.from("platform_settings").upsert(
          {
            key: PLATFORM_PRIVACY_CONFIG_KEY,
            value: originalPrivacy.value,
            updated_at:
              originalPrivacy.updated_at ?? new Date().toISOString(),
          },
          { onConflict: "key" },
        );
      } else {
        await admin
          .from("platform_settings")
          .delete()
          .eq("key", PLATFORM_PRIVACY_CONFIG_KEY);
      }

      await clearSessionCache();
    });

    it("reads terms and privacy via display actions", async () => {
      await runAsBuyer(async () => {
        const [termsResult, privacyResult] = await Promise.all([
          getPlatformTermsForDisplay(),
          getPlatformPrivacyForDisplay(),
        ]);

        expect(termsResult.success).toBe(true);
        if (termsResult.success) {
          expect(termsResult.data.body).toContain(termsSnippet);
        }

        expect(privacyResult.success).toBe(true);
        if (privacyResult.success) {
          expect(privacyResult.data.body).toContain(privacySnippet);
        }
      });
    });

    it("fps_payout_config orphan row is absent", async () => {
      const { data, error } = await admin
        .from("platform_settings")
        .select("key")
        .eq("key", "fps_payout_config")
        .maybeSingle();

      expect(error).toBeNull();
      expect(data).toBeNull();
    });

    it("returns default terms and privacy when platform_settings rows are absent", async () => {
      await admin.from("platform_settings").delete().eq("key", PLATFORM_TERMS_CONFIG_KEY);
      await admin.from("platform_settings").delete().eq("key", PLATFORM_PRIVACY_CONFIG_KEY);

      await runAsBuyer(async () => {
        const [termsResult, privacyResult] = await Promise.all([
          getPlatformTermsForDisplay(),
          getPlatformPrivacyForDisplay(),
        ]);

        expect(termsResult.success).toBe(true);
        if (termsResult.success) {
          expect(termsResult.data.body).toContain(
            DEFAULT_PLATFORM_TERMS.body.slice(0, 40),
          );
        }

        expect(privacyResult.success).toBe(true);
        if (privacyResult.success) {
          expect(privacyResult.data.body).toContain(
            DEFAULT_PLATFORM_PRIVACY.body.slice(0, 40),
          );
        }
      });
    });
  },
);
