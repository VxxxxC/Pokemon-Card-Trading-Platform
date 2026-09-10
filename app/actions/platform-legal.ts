"use server";

import { isCurrentUserAdmin } from "@/lib/auth/require-admin";
import { getOptionalAuthUser } from "@/lib/auth/session";
import {
  buildPlatformLegalDocumentValue,
  DEFAULT_PLATFORM_PRIVACY,
  DEFAULT_PLATFORM_TERMS,
  parsePlatformLegalDocument,
  PLATFORM_PRIVACY_CONFIG_KEY,
  PLATFORM_TERMS_CONFIG_KEY,
  type PlatformLegalDocument,
  validatePlatformLegalBody,
} from "@/lib/platform/platform-legal-config";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

type PlatformSettingsLegalRow = Pick<
  Database["public"]["Tables"]["platform_settings"]["Row"],
  "value" | "updated_at"
>;

export type PlatformLegalDisplayData = PlatformLegalDocument & {
  updatedAtIso: string | null;
};

type PlatformLegalDisplayResult =
  | { success: true; data: PlatformLegalDisplayData }
  | { success: false; error: string };

type PlatformLegalAdminResult =
  | {
      success: true;
      data: {
        terms: PlatformLegalDisplayData;
        privacy: PlatformLegalDisplayData;
      };
    }
  | { success: false; error: string };

async function requireAdmin(): Promise<
  { ok: true; adminId: string } | { ok: false; error: string }
> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "未登入" };
  }

  const user = await getOptionalAuthUser();
  if (!user) {
    return { ok: false, error: "請先登入" };
  }

  const supabase = await createClient();
  const isAdmin = await isCurrentUserAdmin(supabase, user.id);
  if (!isAdmin) {
    return { ok: false, error: "無管理員權限" };
  }

  return { ok: true, adminId: user.id };
}

async function readLegalDocumentFromDb(
  key: string,
  fallback: PlatformLegalDocument,
  useAdminClient: boolean,
): Promise<PlatformLegalDisplayData> {
  if (useAdminClient) {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("platform_settings")
      .select("value, updated_at")
      .eq("key", key)
      .maybeSingle();

    if (error) {
      console.error(`[readLegalDocumentFromDb:${key}]`, error.message);
      return {
        ...fallback,
        updatedAtIso: null,
      };
    }

    const parsed = parsePlatformLegalDocument(data?.value, fallback);
    return {
      ...parsed,
      updatedAtIso: data?.updated_at ?? null,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("platform_settings")
    .select("value, updated_at")
    .eq("key", key)
    .maybeSingle();

  if (error) {
    console.error(`[readLegalDocumentFromDb:${key}]`, error.message);
    return {
      ...fallback,
      updatedAtIso: null,
    };
  }

  const row = data as PlatformSettingsLegalRow | null;
  const parsed = parsePlatformLegalDocument(row?.value, fallback);
  return {
    ...parsed,
    updatedAtIso: row?.updated_at ?? null,
  };
}

export async function getPlatformTermsForDisplay(): Promise<PlatformLegalDisplayResult> {
  if (!isSupabaseConfigured()) {
    return {
      success: true,
      data: {
        ...DEFAULT_PLATFORM_TERMS,
        updatedAtIso: null,
      },
    };
  }

  const data = await readLegalDocumentFromDb(
    PLATFORM_TERMS_CONFIG_KEY,
    DEFAULT_PLATFORM_TERMS,
    false,
  );
  return { success: true, data };
}

export async function getPlatformPrivacyForDisplay(): Promise<PlatformLegalDisplayResult> {
  if (!isSupabaseConfigured()) {
    return {
      success: true,
      data: {
        ...DEFAULT_PLATFORM_PRIVACY,
        updatedAtIso: null,
      },
    };
  }

  const data = await readLegalDocumentFromDb(
    PLATFORM_PRIVACY_CONFIG_KEY,
    DEFAULT_PLATFORM_PRIVACY,
    false,
  );
  return { success: true, data };
}

export async function getPlatformLegalForAdmin(): Promise<PlatformLegalAdminResult> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  const [terms, privacy] = await Promise.all([
    readLegalDocumentFromDb(
      PLATFORM_TERMS_CONFIG_KEY,
      DEFAULT_PLATFORM_TERMS,
      true,
    ),
    readLegalDocumentFromDb(
      PLATFORM_PRIVACY_CONFIG_KEY,
      DEFAULT_PLATFORM_PRIVACY,
      true,
    ),
  ]);

  return { success: true, data: { terms, privacy } };
}

export async function updatePlatformLegal(input: {
  terms: { title: string; body: string };
  privacy: { title: string; body: string };
}): Promise<PlatformLegalAdminResult> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  const termsBodyError = validatePlatformLegalBody(input.terms.body);
  if (termsBodyError) {
    return { success: false, error: `服務條款：${termsBodyError}` };
  }

  const privacyBodyError = validatePlatformLegalBody(input.privacy.body);
  if (privacyBodyError) {
    return { success: false, error: `私隱政策：${privacyBodyError}` };
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const [existingTerms, existingPrivacy] = await Promise.all([
    admin
      .from("platform_settings")
      .select("value")
      .eq("key", PLATFORM_TERMS_CONFIG_KEY)
      .maybeSingle(),
    admin
      .from("platform_settings")
      .select("value")
      .eq("key", PLATFORM_PRIVACY_CONFIG_KEY)
      .maybeSingle(),
  ]);

  const termsValue = buildPlatformLegalDocumentValue(
    existingTerms.data?.value,
    input.terms,
    DEFAULT_PLATFORM_TERMS,
  );
  const privacyValue = buildPlatformLegalDocumentValue(
    existingPrivacy.data?.value,
    input.privacy,
    DEFAULT_PLATFORM_PRIVACY,
  );

  const { error: termsError } = await admin.from("platform_settings").upsert(
    {
      key: PLATFORM_TERMS_CONFIG_KEY,
      value: termsValue,
      updated_by: guard.adminId,
      updated_at: now,
    },
    { onConflict: "key" },
  );

  if (termsError) {
    console.error("[updatePlatformLegal] terms", termsError.message);
    return { success: false, error: "無法儲存服務條款" };
  }

  const { error: privacyError } = await admin.from("platform_settings").upsert(
    {
      key: PLATFORM_PRIVACY_CONFIG_KEY,
      value: privacyValue,
      updated_by: guard.adminId,
      updated_at: now,
    },
    { onConflict: "key" },
  );

  if (privacyError) {
    console.error("[updatePlatformLegal] privacy", privacyError.message);
    return { success: false, error: "無法儲存私隱政策" };
  }

  return {
    success: true,
    data: {
      terms: { ...termsValue, updatedAtIso: now },
      privacy: { ...privacyValue, updatedAtIso: now },
    },
  };
}
