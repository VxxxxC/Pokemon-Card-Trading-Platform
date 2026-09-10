import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST } from "@/app/api/admin/upload-announcement-image/route";
import {
  deleteAnnouncementPosterFromBunny,
} from "@/lib/storage/bunny";
import {
  clearSessionCache,
  runAsAdmin,
  warmSession,
} from "../shared/auth-context";
import { hasBunnyIntegrationEnv } from "../shared/env";

const MINIMAL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe.skipIf(!hasBunnyIntegrationEnv()).sequential(
  "upload announcement image Bunny smoke",
  () => {
    let uploadedObjectKey: string | null = null;

    beforeAll(async () => {
      await warmSession("admin");
    });

    afterAll(async () => {
      if (uploadedObjectKey) {
        await deleteAnnouncementPosterFromBunny(uploadedObjectKey).catch(
          () => undefined,
        );
      }
      await clearSessionCache();
    });

    it("uploads announcement poster for admin and returns Bunny metadata", async () => {
      const announcementId = randomUUID();
      const pngBytes = Buffer.from(MINIMAL_PNG_BASE64, "base64");

      await runAsAdmin(async () => {
        const formData = new FormData();
        formData.append("announcementId", announcementId);
        formData.append(
          "image",
          new Blob([pngBytes], { type: "image/png" }),
          "announcement-smoke.png",
        );

        const response = await POST(
          new Request("http://localhost/api/admin/upload-announcement-image", {
            method: "POST",
            body: formData,
          }),
        );

        expect(response.status).toBe(200);
        const payload = (await response.json()) as {
          success: boolean;
          data?: { objectKey: string; cdnUrl: string };
        };

        expect(payload.success).toBe(true);
        expect(payload.data?.objectKey).toContain(
          `announcements/${announcementId}/`,
        );
        expect(payload.data?.cdnUrl).toMatch(/^https:\/\//);

        uploadedObjectKey = payload.data?.objectKey ?? null;
      });
    });
  },
);
