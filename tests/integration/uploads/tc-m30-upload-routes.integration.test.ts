import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());
const uploadProfileAvatar = vi.hoisted(() => vi.fn());
const uploadListingImage = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    rpc,
  }),
}));

vi.mock("@/lib/storage/bunny", () => ({
  uploadProfileAvatarToBunny: uploadProfileAvatar,
  uploadListingImageToBunny: uploadListingImage,
}));

import { POST as postProfileAvatar } from "@/app/api/profile/upload-avatar/route";
import { POST as postListingImage } from "@/app/api/listings/upload-image/route";

function buildPngFormData(field = "image"): FormData {
  const formData = new FormData();
  formData.append(
    field,
    new Blob([Uint8Array.from([0x89, 0x50, 0x4e, 0x47])], {
      type: "image/png",
    }),
    "test.png",
  );
  return formData;
}

describe("TC-M30 upload routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: null } });
    rpc.mockResolvedValue({ data: { blocked: false }, error: null });
    uploadProfileAvatar.mockRejectedValue(new Error("Bunny storage unavailable"));
    uploadListingImage.mockRejectedValue(new Error("Bunny storage unavailable"));
  });

  it("profile/upload-avatar returns 401 when unauthenticated", async () => {
    const response = await postProfileAvatar(
      new Request("http://localhost/api/profile/upload-avatar", {
        method: "POST",
        body: buildPngFormData(),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("profile/upload-avatar returns 400 when image missing", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "00000000-0000-4000-8000-000000000001" } },
    });

    const response = await postProfileAvatar(
      new Request("http://localhost/api/profile/upload-avatar", {
        method: "POST",
        body: new FormData(),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("profile/upload-avatar surfaces Bunny storage failure", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "00000000-0000-4000-8000-000000000001" } },
    });

    const response = await postProfileAvatar(
      new Request("http://localhost/api/profile/upload-avatar", {
        method: "POST",
        body: buildPngFormData(),
      }),
    );

    expect(response.status).toBe(500);
    const payload = (await response.json()) as { success: boolean; error: string };
    expect(payload.success).toBe(false);
    expect(payload.error).toContain("圖片儲存服務");
  });

  it("listings/upload-image returns 401 when unauthenticated", async () => {
    const response = await postListingImage(
      new Request("http://localhost/api/listings/upload-image", {
        method: "POST",
        body: buildPngFormData(),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("listings/upload-image returns 400 when image missing", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "00000000-0000-4000-8000-000000000001" } },
    });

    const response = await postListingImage(
      new Request("http://localhost/api/listings/upload-image", {
        method: "POST",
        body: new FormData(),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("profile/upload-avatar returns 403 when account is suspended", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "00000000-0000-4000-8000-000000000001" } },
    });
    rpc.mockResolvedValue({
      data: { blocked: true, type: "suspend" },
      error: null,
    });

    const response = await postProfileAvatar(
      new Request("http://localhost/api/profile/upload-avatar", {
        method: "POST",
        body: buildPngFormData(),
      }),
    );

    expect(response.status).toBe(403);
  });

  it("listings/upload-image returns 403 when account is suspended", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "00000000-0000-4000-8000-000000000001" } },
    });
    rpc.mockResolvedValue({
      data: { blocked: true, type: "suspend" },
      error: null,
    });

    const response = await postListingImage(
      new Request("http://localhost/api/listings/upload-image", {
        method: "POST",
        body: buildPngFormData(),
      }),
    );

    expect(response.status).toBe(403);
  });
});
