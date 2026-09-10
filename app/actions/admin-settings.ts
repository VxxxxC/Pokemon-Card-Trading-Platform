"use server";

import { isCurrentUserAdmin } from "@/lib/auth/require-admin";
import { getOptionalAuthUser } from "@/lib/auth/session";
import {
  AUTH_ESCROW_CONFIG_KEY,
  buildAuthEscrowConfigValue,
  DEFAULT_AUTH_FEE_HKD,
  parseAuthFeeFromSettings,
  validateAuthFeeHkd,
} from "@/lib/platform/auth-escrow-config";
import {
  commissionPercentToRate,
  commissionRateToPercent,
  DEFAULT_COMMISSION_RATE,
  parseCommissionRateFromSettings,
  PLATFORM_FINANCIAL_CONFIG_KEY,
  validateCommissionPercent,
} from "@/lib/platform/financial-config";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

type PlatformFinancialConfigResult =
  | {
      success: true;
      data: { commissionRatePercent: number; appraisalFeeHkd: number };
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

async function readCommissionRateFromDb(): Promise<number> {
  if (!isSupabaseConfigured()) {
    return DEFAULT_COMMISSION_RATE;
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", PLATFORM_FINANCIAL_CONFIG_KEY)
    .maybeSingle();

  if (error) {
    console.error("[readCommissionRateFromDb]", error.message);
    return DEFAULT_COMMISSION_RATE;
  }

  return parseCommissionRateFromSettings(data?.value);
}

async function readAuthFeeFromDb(): Promise<number> {
  if (!isSupabaseConfigured()) {
    return DEFAULT_AUTH_FEE_HKD;
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("fn_platform_auth_fee_hkd");

  if (!error && data != null) {
    const fee = Number(data);
    if (Number.isFinite(fee)) {
      return fee;
    }
  }

  if (error) {
    console.error("[readAuthFeeFromDb] rpc", error.message);
  }

  const { data: settingsRow, error: settingsError } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", AUTH_ESCROW_CONFIG_KEY)
    .maybeSingle();

  if (settingsError) {
    console.error("[readAuthFeeFromDb] settings", settingsError.message);
    return DEFAULT_AUTH_FEE_HKD;
  }

  return parseAuthFeeFromSettings(settingsRow?.value);
}

async function writeAuthFeeToDb(
  adminId: string,
  authFeeHkd: number,
): Promise<string | null> {
  const admin = createAdminClient();
  const { data: existingRow, error: readError } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", AUTH_ESCROW_CONFIG_KEY)
    .maybeSingle();

  if (readError) {
    console.error("[writeAuthFeeToDb] read", readError.message);
    return "無法儲存鑑定費設定";
  }

  const nextValue = buildAuthEscrowConfigValue(existingRow?.value, authFeeHkd);
  const { error } = await admin.from("platform_settings").upsert(
    {
      key: AUTH_ESCROW_CONFIG_KEY,
      value: nextValue,
      updated_by: adminId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );

  if (error) {
    console.error("[writeAuthFeeToDb] upsert", error.message);
    return "無法儲存鑑定費設定";
  }

  return null;
}

export async function getPlatformFinancialConfig(): Promise<PlatformFinancialConfigResult> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  const [rate, authFeeHkd] = await Promise.all([
    readCommissionRateFromDb(),
    readAuthFeeFromDb(),
  ]);

  return {
    success: true,
    data: {
      commissionRatePercent: commissionRateToPercent(rate),
      appraisalFeeHkd: authFeeHkd,
    },
  };
}

export async function getPlatformCommissionRateForDisplay(): Promise<
  { success: true; data: { commissionRate: number } } | { success: false; error: string }
> {
  if (!isSupabaseConfigured()) {
    return {
      success: true,
      data: { commissionRate: DEFAULT_COMMISSION_RATE },
    };
  }

  const rate = await readCommissionRateFromDb();
  return { success: true, data: { commissionRate: rate } };
}

export async function getPlatformAuthFeeForDisplay(): Promise<
  { success: true; data: { authFeeHkd: number } } | { success: false; error: string }
> {
  if (!isSupabaseConfigured()) {
    return {
      success: true,
      data: { authFeeHkd: DEFAULT_AUTH_FEE_HKD },
    };
  }

  const authFeeHkd = await readAuthFeeFromDb();
  return { success: true, data: { authFeeHkd } };
}

export async function updatePlatformFinancialConfig(input: {
  commissionRatePercent: number;
  appraisalFeeHkd: number;
}): Promise<PlatformFinancialConfigResult> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  const commissionValidationError = validateCommissionPercent(
    input.commissionRatePercent,
  );
  if (commissionValidationError) {
    return { success: false, error: commissionValidationError };
  }

  const authFeeValidationError = validateAuthFeeHkd(input.appraisalFeeHkd);
  if (authFeeValidationError) {
    return { success: false, error: authFeeValidationError };
  }

  const commissionRate = commissionPercentToRate(input.commissionRatePercent);
  const admin = createAdminClient();

  const { error: commissionError } = await admin.from("platform_settings").upsert(
    {
      key: PLATFORM_FINANCIAL_CONFIG_KEY,
      value: { commissionRate },
      updated_by: guard.adminId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );

  if (commissionError) {
    console.error("[updatePlatformFinancialConfig] commission", commissionError.message);
    return { success: false, error: "無法儲存財務設定" };
  }

  const authFeeError = await writeAuthFeeToDb(guard.adminId, input.appraisalFeeHkd);
  if (authFeeError) {
    return { success: false, error: authFeeError };
  }

  return {
    success: true,
    data: {
      commissionRatePercent: commissionRateToPercent(commissionRate),
      appraisalFeeHkd: input.appraisalFeeHkd,
    },
  };
}
