import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { authState } from "./auth-state";
import { getIntegrationEnv } from "./env";

export type SessionRole = "admin" | "buyer" | "seller";

function readEnv(key: string): string | undefined {
  return process.env[key]?.trim() || undefined;
}

type CachedSession = {
  email: string;
  user: User;
  client: SupabaseClient<Database>;
  expiresAt: number;
};

const REFRESH_BUFFER_MS = 60_000;
const sessionCache = new Map<SessionRole, CachedSession>();

function getCredentials(role: SessionRole): { email: string; password: string } {
  const env = getIntegrationEnv();
  if (role === "admin") {
    return { email: env.adminEmail, password: env.adminPassword };
  }
  if (role === "seller") {
    const email = readEnv("E2E_SELLER_EMAIL");
    const password = readEnv("E2E_SELLER_PASSWORD");
    if (!email || !password) {
      throw new Error(
        "Missing E2E_SELLER_EMAIL or E2E_SELLER_PASSWORD for seller session",
      );
    }
    return { email, password };
  }
  return { email: env.buyerEmail, password: env.buyerPassword };
}

function createAnonClient(): SupabaseClient<Database> {
  const { url, anonKey } = getIntegrationEnv();
  return createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: true, persistSession: false },
  });
}

async function signInAndCache(role: SessionRole): Promise<CachedSession> {
  const { email, password } = getCredentials(role);
  const client = createAnonClient();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user || !data.session) {
    throw new Error(
      `[warmSession:${role}] sign-in failed: ${error?.message ?? "missing session"}`,
    );
  }

  const expiresAt = (data.session.expires_at ?? 0) * 1000;
  const cached: CachedSession = {
    email,
    user: data.user,
    client,
    expiresAt,
  };
  sessionCache.set(role, cached);
  return cached;
}

async function getCachedSession(role: SessionRole): Promise<CachedSession> {
  const existing = sessionCache.get(role);
  if (existing && existing.expiresAt - REFRESH_BUFFER_MS > Date.now()) {
    return existing;
  }
  return signInAndCache(role);
}

export async function warmSession(role: SessionRole): Promise<void> {
  await getCachedSession(role);
}

export function getBuyerUserId(): string {
  const cached = sessionCache.get("buyer");
  if (!cached?.user.id) {
    throw new Error("Buyer session not warmed; call warmSession('buyer') in beforeAll");
  }
  return cached.user.id;
}

export function getSellerUserId(): string {
  const cached = sessionCache.get("seller");
  if (!cached?.user.id) {
    throw new Error("Seller session not warmed; call warmSession('seller') in beforeAll");
  }
  return cached.user.id;
}

export function getAdminUserId(): string {
  const cached = sessionCache.get("admin");
  if (!cached?.user.id) {
    throw new Error("Admin session not warmed; call warmSession('admin') in beforeAll");
  }
  return cached.user.id;
}

export async function runAsAdmin<T>(fn: () => Promise<T>): Promise<T> {
  const session = await getCachedSession("admin");
  authState.user = session.user;
  authState.supabase = session.client;
  return fn();
}

export async function runAsBuyer<T>(fn: () => Promise<T>): Promise<T> {
  const session = await getCachedSession("buyer");
  authState.user = session.user;
  authState.supabase = session.client;
  return fn();
}

export async function runAsSeller<T>(fn: () => Promise<T>): Promise<T> {
  const session = await getCachedSession("seller");
  authState.user = session.user;
  authState.supabase = session.client;
  return fn();
}

export async function clearSessionCache(): Promise<void> {
  for (const session of sessionCache.values()) {
    await session.client.auth.signOut().catch(() => undefined);
  }
  sessionCache.clear();
  authState.user = null;
  authState.supabase = null;
}

export function getBuyerClient(): SupabaseClient<Database> {
  const cached = sessionCache.get("buyer");
  if (!cached?.client) {
    throw new Error(
      "Buyer session not warmed; call warmSession('buyer') in beforeAll",
    );
  }
  return cached.client;
}

export function getAdminClient(): SupabaseClient<Database> {
  const cached = sessionCache.get("admin");
  if (!cached?.client) {
    throw new Error(
      "Admin session not warmed; call warmSession('admin') in beforeAll",
    );
  }
  return cached.client;
}

export function getSellerClient(): SupabaseClient<Database> {
  const cached = sessionCache.get("seller");
  if (!cached?.client) {
    throw new Error(
      "Seller session not warmed; call warmSession('seller') in beforeAll",
    );
  }
  return cached.client;
}

export async function createExtraBuyerClient(): Promise<SupabaseClient<Database>> {
  const { email, password } = getCredentials("buyer");
  const client = createAnonClient();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session) {
    throw new Error(
      `[createExtraBuyerClient] sign-in failed: ${error?.message ?? "missing session"}`,
    );
  }

  return client;
}
