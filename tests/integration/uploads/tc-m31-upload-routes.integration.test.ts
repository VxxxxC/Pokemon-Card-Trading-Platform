import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());
const profileMaybeSingle = vi.hoisted(() => vi.fn());
const pendingCount = vi.hoisted(() => vi.fn());
const uploadEvidence = vi.hoisted(() => vi.fn());
const uploadMerchantAvatar = vi.hoisted(() => vi.fn());
const uploadMerchantBanner = vi.hoisted(() => vi.fn());
const uploadKycDocument = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    rpc,
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: profileMaybeSingle,
            }),
          }),
        };
      }
      if (table === "report_attachments") {
        return {
          select: () => ({
            eq: () => ({
              is: pendingCount,
            }),
          }),
        };
      }
      return {};
    },
  }),
}));

vi.mock("@/lib/storage/bunny", () => ({
  isBunnyStorageConfigured: vi.fn(() => false),
  uploadReportEvidenceToBunny: uploadEvidence,
  uploadMerchantShopAvatarToBunny: uploadMerchantAvatar,
  uploadMerchantShopBannerToBunny: uploadMerchantBanner,
}));

vi.mock("@/lib/storage/kyc-documents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage/kyc-documents")>();
  return {
    ...actual,
    uploadKycDocumentToStorage: uploadKycDocument,
  };
});

import { POST as postReportEvidence } from "@/app/api/reports/upload-evidence/route";
import { POST as postMerchantAvatar } from "@/app/api/merchant/upload-avatar/route";
import { POST as postMerchantBanner } from "@/app/api/merchant/upload-top-banner/route";
import { POST as postKycDocument } from "@/app/api/kyc/upload-document/route";

function buildPngFormData(extra?: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(extra ?? {})) {
    formData.append(key, value);
  }
  formData.append(
    "image",
    new Blob([Uint8Array.from([0x89, 0x50, 0x4e, 0x47])], {
      type: "image/png",
    }),
    "test.png",
  );
  return formData;
}

describe("TC-M31 upload routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: null } });
    rpc.mockResolvedValue({ data: { blocked: false }, error: null });
    profileMaybeSingle.mockResolvedValue({ data: { role: "merchant" }, error: null });
    pendingCount.mockResolvedValue({ count: 0, error: null });
  });

  it("reports/upload-evidence returns 503 when Bunny is not configured", async () => {
    const response = await postReportEvidence(
      new Request("http://localhost/api/reports/upload-evidence", {
        method: "POST",
        body: buildPngFormData(),
      }),
    );

    expect(response.status).toBe(503);
  });

  it("merchant/upload-avatar returns 401 when unauthenticated", async () => {
    const response = await postMerchantAvatar(
      new Request("http://localhost/api/merchant/upload-avatar", {
        method: "POST",
        body: buildPngFormData(),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("merchant/upload-avatar returns 403 for non-merchant role", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "00000000-0000-4000-8000-000000000001" } },
    });
    profileMaybeSingle.mockResolvedValue({ data: { role: "member" }, error: null });

    const response = await postMerchantAvatar(
      new Request("http://localhost/api/merchant/upload-avatar", {
        method: "POST",
        body: buildPngFormData(),
      }),
    );

    expect(response.status).toBe(403);
  });

  it("merchant/upload-top-banner returns 401 when unauthenticated", async () => {
    const response = await postMerchantBanner(
      new Request("http://localhost/api/merchant/upload-top-banner", {
        method: "POST",
        body: buildPngFormData(),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("kyc/upload-document returns 401 when unauthenticated", async () => {
    const response = await postKycDocument(
      new Request("http://localhost/api/kyc/upload-document", {
        method: "POST",
        body: buildPngFormData({ documentType: "br_certificate" }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("kyc/upload-document returns 403 when user is already merchant", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "00000000-0000-4000-8000-000000000001" } },
    });
    profileMaybeSingle.mockResolvedValue({ data: { role: "merchant" }, error: null });

    const response = await postKycDocument(
      new Request("http://localhost/api/kyc/upload-document", {
        method: "POST",
        body: buildPngFormData({ documentType: "br_certificate" }),
      }),
    );

    expect(response.status).toBe(403);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toContain("已是認證商戶");
  });
});
