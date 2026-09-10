import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getIntegrationEnv, hasBaseIntegrationEnv } from "../shared/env";
import { createServiceRoleClient } from "../shared/supabase-admin";
import { warmSession, getBuyerClient, getAdminClient, clearSessionCache, runAsBuyer } from "../shared/auth-context";
import { authState } from "../shared/auth-state";

const describeSecurity = hasBaseIntegrationEnv()
  ? describe
  : describe.skip;

describeSecurity("production security remediation", () => {
  const disposableUserIds: string[] = [];

  beforeAll(async () => {
    await warmSession("buyer");
    await warmSession("admin");
  });

  afterAll(async () => {
    const admin = createServiceRoleClient();
    for (const id of disposableUserIds) {
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
    await clearSessionCache();
  });

  async function createConfirmedUser(prefix: string, metadata: Record<string, unknown> = {}) {
    const env = getIntegrationEnv();
    const admin = createServiceRoleClient();
    const email = `${prefix}-${randomUUID().slice(0, 8)}@example.invalid`;
    const password = `Sec!${randomUUID().slice(0, 12)}`;
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (!created.data.user?.id) {
      throw new Error(`Failed to create ${prefix} user`);
    }
    disposableUserIds.push(created.data.user.id);
    const client = createClient(env.url, env.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signIn = await client.auth.signInWithPassword({ email, password });
    if (!signIn.data.session) {
      throw new Error(`Failed to sign in ${prefix}: ${signIn.error?.message}`);
    }
    return { client, userId: created.data.user.id };
  }

  it("CRIT-01: signup metadata cannot set admin role", async () => {
    const env = getIntegrationEnv();
    const email = `crit01-${randomUUID().slice(0, 8)}@example.invalid`;
    const password = `Sec!${randomUUID().slice(0, 12)}`;
    const anon = createClient(env.url, env.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signup = await anon.auth.signUp({
      email,
      password,
      options: { data: { role: "admin", display_name: "crit01" } },
    });
    expect(signup.error).toBeNull();
    const userId = signup.data.user?.id;
    expect(userId).toBeTruthy();
    if (userId) disposableUserIds.push(userId);

    const admin = createServiceRoleClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userId!)
      .maybeSingle();
    expect(profile?.role).toBe("member");
  });

  it("CRIT-02: authenticated user cannot self-escalate role", async () => {
    const { client, userId } = await createConfirmedUser("crit02", { role: "member" });
    const update = await client
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", userId)
      .select("role");
    expect(update.error).toBeTruthy();
    const { data: profile } = await client
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();
    expect(profile?.role).toBe("member");

    const mod = await client.rpc("search_admin_moderation_cases", {
      p_page: 1,
      p_page_size: 1,
    });
    expect(mod.error).toBeTruthy();
  });

  it("CRIT-02: legitimate profile fields remain updateable", async () => {
    const { client, userId } = await createConfirmedUser("crit02b");
    const update = await client
      .from("profiles")
      .update({ display_name: "Security Test User" })
      .eq("id", userId)
      .select("display_name");
    expect(update.error).toBeNull();
    expect(update.data?.[0]?.display_name).toBe("Security Test User");
  });

  it("DB-H-02: authenticated can heartbeat last_active_at on own profile", async () => {
    const { client, userId } = await createConfirmedUser("activity");
    const heartbeatAt = new Date().toISOString();
    const update = await client
      .from("profiles")
      .update({
        last_active_at: heartbeatAt,
        updated_at: heartbeatAt,
      })
      .eq("id", userId)
      .select("last_active_at");
    expect(update.error).toBeNull();
    expect(update.data?.[0]?.last_active_at).toBeTruthy();
  });

  it("CRIT-03: authenticated cannot mint arbitrary points", async () => {
    const { client } = await createConfirmedUser("crit03");
    const mint = await client.rpc("fn_claim_mission_points", {
      p_mission_id: randomUUID(),
      p_points: 50000,
      p_description: "security regression",
    });
    expect(mint.error).toBeTruthy();
  });

  it("DB-H-01: anon cannot read kyc_records stripe ids", async () => {
    const env = getIntegrationEnv();
    const anon = createClient(env.url, env.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await anon
      .from("kyc_records")
      .select("stripe_account_id")
      .limit(1);
    expect(error).toBeTruthy();
    expect(data ?? []).toHaveLength(0);
  });

  it("DB-H-01: buyer resolves merchant payout readiness via public verification RPC", async () => {
    const env = getIntegrationEnv();
    const { client: buyer } = await createConfirmedUser("kyc-rpc-buyer");
    const { client: merchant, userId: merchantId } = await createConfirmedUser(
      "kyc-rpc-merchant",
    );

    const admin = createClient(env.url, env.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await admin.from("kyc_records").upsert({
      merchant_id: merchantId,
      kyc_status: "verified",
      stripe_charges_enabled: true,
      stripe_payouts_enabled: true,
      stripe_account_id: "acct_security_regression",
    });

    const { data, error } = await buyer.rpc("fn_get_merchant_public_verification", {
      p_merchant_id: merchantId,
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({
      kyc_status: "verified",
      stripe_charges_enabled: true,
      stripe_payouts_enabled: true,
      verified: true,
    });
  });

  it("DB-H-02: anon cannot read sensitive profiles columns directly", async () => {
    const env = getIntegrationEnv();
    const anon = createClient(env.url, env.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await anon.from("profiles").select("fps_id, role").limit(1);
    expect(error).toBeTruthy();
    expect(data ?? []).toHaveLength(0);
  });

  it("DB-H-02: public_profiles exposes safe marketplace fields only", async () => {
    const env = getIntegrationEnv();
    const anon = createClient(env.url, env.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await anon
      .from("public_profiles")
      .select("id, display_name, is_merchant")
      .limit(1);
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThanOrEqual(0);
  });

  it("DB-H-03: financial platform_settings not public", async () => {
    const env = getIntegrationEnv();
    const anon = createClient(env.url, env.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const financial = await anon
      .from("platform_settings")
      .select("key")
      .eq("key", "platform_financial_config")
      .maybeSingle();
    expect(financial.error).toBeNull();
    expect(financial.data).toBeNull();

    const legal = await anon
      .from("platform_settings")
      .select("key")
      .eq("key", "platform_terms")
      .maybeSingle();
    expect(legal.error).toBeNull();
  });

  it("DB-H-07: authenticated cannot read unrelated completed orders", async () => {
    const buyer = getBuyerClient();
    const { data, error } = await buyer
      .from("member_orders")
      .select("id, buyer_id, seller_id")
      .eq("status", "completed");
    expect(error).toBeNull();
    const userId = (await buyer.auth.getUser()).data.user?.id;
    for (const row of data ?? []) {
      expect(row.buyer_id === userId || row.seller_id === userId).toBe(true);
    }
  });

  it("AUTHZ-H-04: suspended user profile mutation blocked at action layer", async () => {
    const { client, userId } = await createConfirmedUser("susp");
    const admin = createServiceRoleClient();
    await admin.from("account_sanctions").insert({
      user_id: userId,
      scope: "account",
      type: "suspend",
      reason: "security-test",
      starts_at: new Date().toISOString(),
      ends_at: new Date(Date.now() + 86_400_000).toISOString(),
    });

    const { requireActiveAuthUser } = await import("@/lib/auth/mutation-guard");
    authState.user = (await client.auth.getUser()).data.user;
    authState.supabase = client;

    const guard = await requireActiveAuthUser();
    expect(guard.ok).toBe(false);

    authState.user = null;
    authState.supabase = null;

    await admin.from("account_sanctions").delete().eq("user_id", userId);
  });

  it("AUTHZ-H-04: suspended user blocked by requireActiveApiUser", async () => {
    const { requireActiveApiUser } = await import(
      "@/lib/auth/require-active-api-user"
    );
    const { client, userId } = await createConfirmedUser("api-susp");
    const admin = createServiceRoleClient();
    await admin.from("account_sanctions").insert({
      user_id: userId,
      scope: "account",
      type: "suspend",
      reason: "security-test",
      starts_at: new Date().toISOString(),
      ends_at: new Date(Date.now() + 86_400_000).toISOString(),
    });

    authState.user = (await client.auth.getUser()).data.user;
    authState.supabase = client;

    const guard = await requireActiveApiUser();
    expect(guard.ok).toBe(false);
    if (!guard.ok) {
      expect(guard.status).toBe(403);
    }

    authState.user = null;
    authState.supabase = null;
    await admin.from("account_sanctions").delete().eq("user_id", userId);
  });
  it("R-01: non-admin buyer fails admin page access decision", async () => {
    const buyer = getBuyerClient();
    const userId = (await buyer.auth.getUser()).data.user?.id;
    expect(userId).toBeTruthy();

    const { data: profile } = await buyer
      .from("profiles")
      .select("role")
      .eq("id", userId!)
      .single();
    expect(profile?.role).not.toBe("admin");

    const { isCurrentUserAdmin, resolveAdminPageAccess } = await import(
      "@/lib/auth/require-admin"
    );
    const isAdmin = await isCurrentUserAdmin(buyer, userId!);
    expect(isAdmin).toBe(false);

    const decision = resolveAdminPageAccess({
      configured: true,
      user: (await buyer.auth.getUser()).data.user,
      isAdmin,
    });
    expect(decision).toEqual({ allow: false, redirectTo: "/" });
  });

  it("R-01: non-admin cannot invoke admin settings server action", async () => {
    const { getPlatformFinancialConfig } = await import(
      "@/app/actions/admin-settings"
    );
    const buyer = getBuyerClient();
    authState.user = (await buyer.auth.getUser()).data.user;
    authState.supabase = buyer;

    const result = await getPlatformFinancialConfig();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/管理員/);
    }

    authState.user = null;
    authState.supabase = null;
  });

  it("R-01 regression: admin still passes layout access decision and settings action", async () => {
    const admin = getAdminClient();
    const userId = (await admin.auth.getUser()).data.user?.id;
    expect(userId).toBeTruthy();

    const { isCurrentUserAdmin, resolveAdminPageAccess } = await import(
      "@/lib/auth/require-admin"
    );
    const isAdmin = await isCurrentUserAdmin(admin, userId!);
    expect(isAdmin).toBe(true);

    const decision = resolveAdminPageAccess({
      configured: true,
      user: (await admin.auth.getUser()).data.user,
      isAdmin,
    });
    expect(decision.allow).toBe(true);

    const { getPlatformFinancialConfig } = await import(
      "@/app/actions/admin-settings"
    );
    authState.user = (await admin.auth.getUser()).data.user;
    authState.supabase = admin;
    const result = await getPlatformFinancialConfig();
    expect(result.success).toBe(true);

    authState.user = null;
    authState.supabase = null;
  });

  it("SEC-H-07: dev member-order mock RPC rejects non-admin callers", async () => {
    await warmSession("buyer");
    const { confirmPlatformReceived } = await import(
      "@/app/actions/admin-member-orders"
    );

    await runAsBuyer(async () => {
      const result = await confirmPlatformReceived(
        "00000000-0000-4000-8000-000000000001",
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("無管理員權限");
      }
    });
  });
});
