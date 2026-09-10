import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/storage/bunny", () => ({
  isBunnyStorageConfigured: vi.fn(() => false),
  uploadAnnouncementPosterToBunny: vi.fn(),
}));

import { POST } from "@/app/api/admin/upload-announcement-image/route";

describe("upload-announcement-image route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 503 when Bunny storage is not configured", async () => {
    const formData = new FormData();
    formData.append("announcementId", "00000000-0000-4000-8000-000000000001");
    formData.append(
      "image",
      new Blob([Uint8Array.from([0x89, 0x50, 0x4e, 0x47])], {
        type: "image/png",
      }),
      "test.png",
    );

    const response = await POST(
      new Request("http://localhost/api/admin/upload-announcement-image", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(503);
    const payload = (await response.json()) as {
      success: boolean;
      error: string;
    };
    expect(payload.success).toBe(false);
    expect(payload.error).toContain("圖片儲存服務");
  });
});
