# 🏛️ MASTER BACKEND WIRING MANIFEST

> **Project**: HKCardVault (Pokémon TCG Trading & Vault Platform)  
> **Generated Date**: 2026-07-24  
> **Target Framework**: Next.js 16 (App Router), React 19, Supabase BaaS, Tailwind CSS v4  
> **Purpose**: Master blueprint mapping all UI/UX mock data states to target Supabase tables, views/RPCs, Server Actions contracts, and RLS security policies ahead of the Supabase BaaS integration phase.

---

## 1. EXECUTIVE SUMMARY

The HKCardVault Admin Workbench modules and frontend client component suites have achieved **100% UI/UX implementation completeness**. All visual components adhere to the dark-gold terminal design system (`DESIGN.md`), featuring spring physics animations, WCAG AA contrast compliance, responsive layouts, and rich interactive mock states.

### Implementation Readiness Matrix
- **UI / UX Visual Completeness**: 🟢 100% (All Admin Workbench sub-pages & client modals styled and interactive)
- **Inline Mock Codebase Tagging**: 🟢 100% Annotated with standardized `// TODO: [Supabase Wiring]` tags
- **Supabase BaaS Table Readiness**: 🟡 40% (Core entities `profiles`, `orders`, `listings`, `chat_messages` exist; admin/governance tables pending migration)
- **Server Action Contract Wiring**: 🔴 0% (Contracts designed below; production server actions in `app/actions/admin.ts` to be implemented)

---

## 2. PAGE-BY-PAGE INTEGRATION MATRIX

| Admin Route / Component | Current Mock States & Variables | Target Supabase Table / RPC | Required Server Action Signature | RLS & Security Policy |
| :--- | :--- | :--- | :--- | :--- |
| **`/admin/dashboard`** | `userEcology`, `marketVolume`, `revenues`, `initialServices` | `profiles`, `orders`, `listings`, `platform_settings` <br>`rpc: get_user_ecology_stats()` <br>`rpc: get_market_volume_metrics()` <br>`rpc: get_platform_revenue_metrics()` | `getDashboardMetrics()` <br>`getSystemHealthStatus()` | Admin Read-Only (`is_admin()`) |
| **`/admin/payouts`** | `initialWithdrawals`, `initialMerchantAccounts` | `payout_requests`, `stripe_connect_accounts`, `profiles` <br>`view: v_merchant_stripe_balances` | `listPayoutRequests(params)` <br>`executePayoutAction(id, status)` <br>`exportPayoutsCsv(filter)` | Fail-Closed Admin Only (`is_admin()`) |
| **`/admin/merchants`** | `initialStripeRecords`, `initialOnboardingApps`, `initialAuditLogs` | `kyc_applications`, `stripe_connect_accounts`, `audit_logs` <br>`rpc: list_merchant_kyc_records()` | `listKycApplications(params)` <br>`reviewKycApp(id, decision, reason)` <br>`executeAdminOverride(target, action, reason)` | Append-Only Audit Log (`is_admin()`) |
| **`/admin/disputes`** | `mockDisputes.ts`, chatHistory, auditLog | `user_reports`, `orders`, `chat_messages`, `escrow_accounts` <br>`rpc: list_dispute_cases()` | `listDisputes(status, filter)` <br>`getDisputeById(id)` <br>`resolveArbitration(params)` | Admin Escrow Override (`is_admin()`) |
| **`/admin/catalog`** | `initialCards`, manual form entries | `card_catalog` <br>`rpc: list_card_catalog_entries()` | `getCardCatalogEntries(query)` <br>`insertManualCardEntry(input)` <br>`reviewCardEntry(id, status)` | RLS Public Read / Admin Write |
| **`/admin/campaigns`** | `initialCampaigns`, `auditRows`, form states | `campaigns`, `campaign_redemptions`, `audit_logs` <br>`rpc: list_campaign_redemption_audits()` | `listCampaigns(status)` <br>`createCampaign(data)` <br>`toggleCampaignStatus(id, status)` | Admin Write (`is_admin()`) |
| **`/admin/settings`** | `commissionRate`, `appraisalFee` (DB); legal terms + privacy (DB); FPS fee (read-only code constant) | `platform_settings` (`platform_financial_config`, `auth_escrow_config`, `platform_terms`, `platform_privacy`); FPS fee: `lib/platform/fps-payout-config.ts`; batch schedule: `lib/admin-payouts/fps-batch-config.ts` (code SSOT; `fps_payout_config` row removed) | `getPlatformFinancialConfig()` / `updatePlatformFinancialConfig()` · `getPlatformLegalForAdmin()` / `updatePlatformLegal()` | Strict Admin Fail-Closed (`is_admin()`) |
| **`/admin/announcements`** | Admin form + list (was local mock) | `platform_announcements` · Bunny `announcements/` posters · `fn_platform_active_announcements()` | `getAnnouncementsForAdmin()` · `createPlatformAnnouncement()` · `updatePlatformAnnouncement()` · `deletePlatformAnnouncement()` · `togglePlatformAnnouncementActive()` · `POST /api/admin/upload-announcement-image` | Admin Write (`is_admin()`); public read all rows |
| **`/` (homepage)** | `AnnouncementModal` carousel | `platform_announcements` (active window, HKT) | `getActiveAnnouncementsForDisplay()` | Public Read |
| **`/announcements`** | Public list + tabs | `platform_announcements` | `getAnnouncementsForPublicList()` | Public Read |
| **`UserReportModal.tsx`** | `submitUserReport` fallback handlers | `user_reports`, `chat_rooms`, `profiles` | `submitUserReport(input)` | Authenticated User Insert / Admin Read |

---

## 3. REQUIRED MIGRATION & SCHEMA CHECKLIST

To support the complete Admin Workbench and compliance infrastructure, the following Supabase database tables and migrations must be executed:

### 3.1 `kyc_applications` (Merchant & Identity KYC Verification)
```sql
CREATE TYPE public.kyc_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE public.kyc_applications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shop_name     text NOT NULL,
  applicant_name text NOT NULL,
  handle        text NOT NULL,
  doc_type      text NOT NULL, -- passport | id_card | license | cert
  document_path text NOT NULL, -- Supabase Storage Private Bucket Path
  status        public.kyc_status NOT NULL DEFAULT 'pending',
  reviewed_by   uuid REFERENCES public.profiles(id),
  reviewed_at   timestamptz,
  reject_reason text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.kyc_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY kyc_owner_read ON public.kyc_applications
  FOR SELECT USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY kyc_admin_write ON public.kyc_applications
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
```

### 3.2 `platform_settings` (Core Financial & Security Key-Value Config)
```sql
CREATE TABLE public.platform_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_by  uuid REFERENCES public.profiles(id),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY settings_public_read ON public.platform_settings
  FOR SELECT USING (true);
CREATE POLICY settings_admin_write ON public.platform_settings
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
```

### 3.3 `audit_logs` (Append-Only Governance & Privilege Override Trail)
```sql
CREATE TABLE public.audit_logs (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_id     uuid NOT NULL REFERENCES public.profiles(id),
  admin_email  text NOT NULL,
  action       text NOT NULL,
  target_user  text,
  target_table text,
  target_id    text,
  before_snap  jsonb,
  after_snap   jsonb,
  reason       text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_admin_read ON public.audit_logs
  FOR SELECT USING (public.is_admin());
CREATE POLICY audit_admin_insert ON public.audit_logs
  FOR INSERT WITH CHECK (public.is_admin());
-- Note: No UPDATE or DELETE policies are defined, enforcing immutable append-only storage.
```

### 3.4 `campaigns` & `campaign_redemptions` (Marketing & Gamification)
```sql
CREATE TYPE public.campaign_status AS ENUM ('active', 'paused', 'expired');
CREATE TYPE public.audience_type AS ENUM ('guest', 'member', 'vip');
CREATE TYPE public.anti_fraud_type AS ENUM ('ip', 'email_sms', 'kyc', 'stripe_device');
CREATE TYPE public.reward_type AS ENUM ('commission_discount', 'cash_off', 'shipping', 'points');

CREATE TABLE public.campaigns (
  id            text PRIMARY KEY, -- e.g., CMP-01
  name          text NOT NULL,
  type          text NOT NULL,
  banner_url    text,
  start_date    date NOT NULL,
  end_date      date NOT NULL,
  audience      public.audience_type NOT NULL DEFAULT 'guest',
  anti_fraud    public.anti_fraud_type NOT NULL DEFAULT 'ip',
  tasks         jsonb NOT NULL DEFAULT '[]'::jsonb,
  reward_type   public.reward_type NOT NULL,
  reward_value  numeric NOT NULL,
  reward_limit  integer,
  clicks        integer NOT NULL DEFAULT 0,
  redeems       integer NOT NULL DEFAULT 0,
  status        public.campaign_status NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.campaign_redemptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   text NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  order_id      uuid REFERENCES public.orders(id),
  action        text NOT NULL,
  commission    numeric NOT NULL DEFAULT 0,
  gmv           numeric NOT NULL DEFAULT 0,
  risk_status   text NOT NULL DEFAULT 'normal', -- normal | review | suspicious
  redeemed_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY campaigns_public_read ON public.campaigns FOR SELECT USING (true);
CREATE POLICY campaigns_admin_write ON public.campaigns FOR ALL USING (public.is_admin());
CREATE POLICY redemptions_admin_read ON public.campaign_redemptions FOR SELECT USING (public.is_admin());
```

### 3.5 `payout_requests` & `stripe_connect_accounts` (Financial Payouts)
```sql
CREATE TYPE public.payout_status AS ENUM ('pending', 'processing', 'completed', 'failed');

CREATE TABLE public.payout_requests (
  id           text PRIMARY KEY, -- WD-1002
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_name    text NOT NULL,
  amount       numeric NOT NULL,
  fps_id       text NOT NULL,
  status       public.payout_status NOT NULL DEFAULT 'pending',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE TABLE public.stripe_connect_accounts (
  id                  text PRIMARY KEY, -- M-01
  sub_account_id      text NOT NULL UNIQUE, -- acct_1NfG82H
  merchant_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  merchant_name       text NOT NULL,
  balance             numeric NOT NULL DEFAULT 0,
  total_payout        numeric NOT NULL DEFAULT 0,
  platform_commission numeric NOT NULL DEFAULT 0,
  kyc_status          text NOT NULL DEFAULT 'verified',
  payout_status       text NOT NULL DEFAULT 'enabled',
  status              text NOT NULL DEFAULT 'active', -- active | restricted
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_connect_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY payout_owner_read ON public.payout_requests FOR SELECT USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY payout_admin_write ON public.payout_requests FOR ALL USING (public.is_admin());
CREATE POLICY stripe_admin_all ON public.stripe_connect_accounts FOR ALL USING (public.is_admin());
```

---

## 4. SERVER ACTIONS CONTRACT DRAFTS (`app/actions/admin.ts`)

All production admin Server Actions will be located in `app/actions/admin.ts`. Every action strictly executes:
1. Session & Role Verification via `getOptionalAuthUser()` / `is_admin()`
2. Fail-closed service-role execution via `createAdminClient()`
3. Automatic `audit_logs` entry insertion for high-risk operations
4. `revalidatePath` call for affected admin routes

```typescript
"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getOptionalAuthUser } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";

export interface AdminActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

// ── 1. Dashboard & Metrics ───────────────────────────────────────────────────
export async function getDashboardMetrics(): Promise<AdminActionResult<{
  userEcology: any;
  marketVolume: any;
  revenues: any;
}>>;

export async function getSystemHealthStatus(): Promise<AdminActionResult<{
  services: Array<{ id: string; name: string; latency: number; status: string }>;
}>>;

// ── 2. Payouts & Financials ──────────────────────────────────────────────────
export async function listPayoutRequests(params?: {
  status?: string;
  search?: string;
}): Promise<AdminActionResult<{ withdrawals: any[] }>>;

export async function executePayoutAction(
  payoutId: string,
  newStatus: "completed" | "processing" | "failed",
  reason?: string
): Promise<AdminActionResult>;

export async function listMerchantStripeAccounts(params?: {
  search?: string;
}): Promise<AdminActionResult<{ merchants: any[] }>>;

// ── 3. Merchants & KYC Review ───────────────────────────────────────────────
export async function listKycApplications(params?: {
  status?: "pending" | "approved" | "rejected";
  search?: string;
}): Promise<AdminActionResult<{ applications: any[] }>>;

export async function reviewKycApplication(
  applicationId: string,
  decision: "approved" | "rejected",
  reason?: string
): Promise<AdminActionResult<{ newRole?: "MERCHANT" }>>;

export async function executeAdminOverride(input: {
  targetUser: string;
  action: string;
  reason: string;
}): Promise<AdminActionResult<{ auditLogId: string }>>;

// ── 4. Dispute Resolution & Escalation ──────────────────────────────────────
export async function listDisputeCases(params?: {
  status?: string;
  search?: string;
}): Promise<AdminActionResult<{ disputes: any[] }>>;

export async function resolveArbitrationCase(input: {
  caseId: string;
  orderId: string;
  action: "buyer_refunded" | "buyer_refunded_partial" | "seller_released" | "frozen" | "ban";
  reason: string;
  refundAmount?: number;
}): Promise<AdminActionResult>;

// ── 5. Product Catalog & Manual Entry ───────────────────────────────────────
export async function getCardCatalogEntries(params?: {
  query?: string;
  page?: number;
}): Promise<AdminActionResult<{ cards: any[]; total: number }>>;

export async function insertManualCardEntry(input: {
  cardNo: string;
  name: string;
  nameJP?: string;
  set: string;
  rarity: string;
  imageUrl: string;
}): Promise<AdminActionResult<{ id: string }>>;

// ── 6. Campaigns & Redemption Audits ────────────────────────────────────────
export async function listCampaigns(params?: {
  status?: string;
}): Promise<AdminActionResult<{ campaigns: any[] }>>;

export async function createCampaign(input: {
  name: string;
  bannerUrl?: string;
  startDate: string;
  endDate: string;
  audience: string;
  antiFraud: string;
  tasks: string[];
  rewardType: string;
  rewardValue: number;
  rewardLimit?: number;
}): Promise<AdminActionResult<{ id: string }>>;

export async function listCampaignRedemptionAudits(): Promise<
  AdminActionResult<{ audits: any[] }>
>;

// ── 7. Platform Settings ────────────────────────────────────────────────────
export async function getPlatformSettings(): Promise<
  AdminActionResult<Record<string, any>>
>;

export async function updatePlatformSettings(
  settings: Record<string, any>
): Promise<AdminActionResult>;
```

---

## 5. VERIFICATION & COMPLIANCE CHECKLIST

Before deploying each phase of Supabase integration, verify:
- [x] All mock datasets in `app/admin/**` and components annotated with `// TODO: [Supabase Wiring]`
- [x] `BACKEND_WIRING_MANIFEST.md` published at project root
- [x] `bunx tsc --noEmit` passes with **0 type errors**
- [x] `bun run lint` passes with **0 linter warnings**
