import { AUTH_ESCROW_CONFIG_KEY } from "@/lib/platform/auth-escrow-config";
import { PLATFORM_FINANCIAL_CONFIG_KEY } from "@/lib/platform/financial-config";
import {
  PLATFORM_PRIVACY_CONFIG_KEY,
  PLATFORM_TERMS_CONFIG_KEY,
} from "@/lib/platform/platform-legal-config";

/** Keys stored in `platform_settings` (DB SSOT). */
export const PLATFORM_SETTINGS_KEYS = {
  financial: PLATFORM_FINANCIAL_CONFIG_KEY,
  authEscrow: AUTH_ESCROW_CONFIG_KEY,
  terms: PLATFORM_TERMS_CONFIG_KEY,
  privacy: PLATFORM_PRIVACY_CONFIG_KEY,
} as const;

export type PlatformSettingsDbKey =
  (typeof PLATFORM_SETTINGS_KEYS)[keyof typeof PLATFORM_SETTINGS_KEYS];

export type PlatformSettingsKeyMeta = {
  key: PlatformSettingsDbKey;
  ssot: "db";
  readers: string[];
  writers: string[];
};

export const PLATFORM_SETTINGS_KEY_REGISTRY: PlatformSettingsKeyMeta[] = [
  {
    key: PLATFORM_FINANCIAL_CONFIG_KEY,
    ssot: "db",
    readers: [
      "fn_platform_commission_rate()",
      "lib/platform/financial-config.ts",
      "app/actions/admin-settings.ts",
    ],
    writers: ["app/actions/admin-settings.ts (admin)"],
  },
  {
    key: AUTH_ESCROW_CONFIG_KEY,
    ssot: "db",
    readers: [
      "fn_platform_auth_escrow_config()",
      "fn_platform_auth_fee_hkd()",
      "lib/platform/auth-escrow-config.ts",
      "app/actions/admin-settings.ts",
    ],
    writers: ["app/actions/admin-settings.ts (admin)"],
  },
  {
    key: PLATFORM_TERMS_CONFIG_KEY,
    ssot: "db",
    readers: [
      "app/actions/platform-legal.ts",
      "lib/platform/platform-legal-config.ts",
    ],
    writers: ["app/actions/platform-legal.ts (admin)"],
  },
  {
    key: PLATFORM_PRIVACY_CONFIG_KEY,
    ssot: "db",
    readers: [
      "app/actions/platform-legal.ts",
      "lib/platform/platform-legal-config.ts",
    ],
    writers: ["app/actions/platform-legal.ts (admin)"],
  },
];

export type CodeSsotPolicyMeta = {
  policy: string;
  tsModule: string;
  sqlFn?: string;
  readers: string[];
};

/** Policies frozen in code — not stored in `platform_settings`. */
export const CODE_SSOT_POLICIES: CodeSsotPolicyMeta[] = [
  {
    policy: "FPS manual transfer fee",
    tsModule: "lib/platform/fps-payout-config.ts",
    sqlFn: "fn_platform_fps_manual_transfer_fee_hkd()",
    readers: [
      "rpc_finalize_member_fps_payout_ready",
      "app/admin/payouts/components/FpsLedgerTab.tsx",
    ],
  },
  {
    policy: "P2P meetup AML limits",
    tsModule: "lib/platform/p2p-aml-config.ts",
    sqlFn: "fn_assert_p2p_offer_aml_limits()",
    readers: ["Offer / buy-now server paths"],
  },
  {
    policy: "FPS batch weekday / cutoff",
    tsModule: "lib/admin-payouts/fps-batch-config.ts",
    readers: ["getNextBatchSchedule()", "FpsLedgerTab schedule display"],
  },
];
