import { randomUUID } from "crypto";

export type BunnyStorageConfig = {
  zoneName: string;
  accessKey: string;
  cdnHostname: string;
  region?: string;
};

export function getBunnyStorageConfig(): BunnyStorageConfig | null {
  const zoneName = process.env.BUNNY_STORAGE_ZONE_NAME;
  const accessKey = process.env.BUNNY_STORAGE_ACCESS_KEY;
  const cdnHostname = process.env.BUNNY_CDN_HOSTNAME;
  const region = process.env.BUNNY_STORAGE_REGION;

  if (!zoneName || !accessKey || !cdnHostname) {
    return null;
  }

  return {
    zoneName,
    accessKey,
    cdnHostname,
    region: region || undefined,
  };
}

export function isBunnyStorageConfigured(): boolean {
  return getBunnyStorageConfig() !== null;
}

function getStorageBaseUrl(config: BunnyStorageConfig): string {
  if (config.region) {
    return `https://${config.region}.storage.bunnycdn.com`;
  }
  return "https://storage.bunnycdn.com";
}

export function buildListingObjectKey(
  sellerId: string,
  extension: string,
): string {
  const safeExt = extension.replace(/^\./, "").toLowerCase() || "webp";
  return `listings/${sellerId}/${randomUUID()}.${safeExt}`;
}

export function buildAvatarObjectKey(
  userId: string,
  extension: string,
): string {
  const safeExt = extension.replace(/^\./, "").toLowerCase() || "webp";
  return `avatars/${userId}/${randomUUID()}.${safeExt}`;
}

export function buildShopAvatarObjectKey(
  merchantId: string,
  extension: string,
): string {
  const safeExt = extension.replace(/^\./, "").toLowerCase() || "webp";
  return `shop-avatars/${merchantId}/${randomUUID()}.${safeExt}`;
}

export function buildShopBannerObjectKey(
  merchantId: string,
  extension: string,
): string {
  const safeExt = extension.replace(/^\./, "").toLowerCase() || "webp";
  return `shop-banners/${merchantId}/${randomUUID()}.${safeExt}`;
}

export function buildReportEvidenceObjectKey(
  userId: string,
  extension: string,
): string {
  const safeExt = extension.replace(/^\./, "").toLowerCase() || "jpg";
  return `reports/pending/${userId}/${randomUUID()}.${safeExt}`;
}

export function buildAnnouncementPosterObjectKey(
  announcementId: string,
  extension: string,
): string {
  const safeExt = extension.replace(/^\./, "").toLowerCase() || "webp";
  return `announcements/${announcementId}/${randomUUID()}.${safeExt}`;
}

export function buildListingCdnUrl(
  config: BunnyStorageConfig,
  objectKey: string,
): string {
  const hostname = config.cdnHostname.replace(/\/$/, "");
  const path = objectKey.replace(/^\//, "");
  return `https://${hostname}/${path}`;
}

/** Validate that a URL points to our configured Bunny CDN hostname. */
export function isAllowedBunnyCdnUrl(url: string): boolean {
  const config = getBunnyStorageConfig();
  if (!config) return false;

  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "https:") return false;
    const expectedHost = config.cdnHostname.replace(/\/$/, "").toLowerCase();
    return parsed.hostname.toLowerCase() === expectedHost;
  } catch {
    return false;
  }
}

/** Extract Bunny object key from a CDN URL, or null if not on our CDN. */
export function bunnyObjectKeyFromCdnUrl(url: string): string | null {
  if (!isAllowedBunnyCdnUrl(url)) return null;

  try {
    const parsed = new URL(url.trim());
    return parsed.pathname.replace(/^\//, "");
  } catch {
    return null;
  }
}

function extensionFromContentType(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/heic" || contentType === "image/heif") return "heic";
  return "jpg";
}

export type BunnyListingUpload = {
  objectKey: string;
  cdnUrl: string;
};

export type BunnyAvatarUpload = BunnyListingUpload;

function buildObjectDeleteUrl(config: BunnyStorageConfig, objectKey: string): string {
  const path = objectKey.replace(/^\//, "");
  return `${getStorageBaseUrl(config)}/${config.zoneName}/${path}`;
}

export async function uploadListingImageToBunny(
  sellerId: string,
  fileBytes: Uint8Array,
  contentType: string,
): Promise<BunnyListingUpload> {
  const config = getBunnyStorageConfig();
  if (!config) {
    throw new Error("Bunny.net storage is not configured");
  }

  const extension = extensionFromContentType(contentType);
  const objectKey = buildListingObjectKey(sellerId, extension);
  const uploadUrl = buildObjectDeleteUrl(config, objectKey);

  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      AccessKey: config.accessKey,
      "Content-Type": contentType,
    },
    body: Buffer.from(fileBytes),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Bunny upload failed (${response.status})${detail ? `: ${detail}` : ""}`,
    );
  }

  return {
    objectKey,
    cdnUrl: buildListingCdnUrl(config, objectKey),
  };
}

export async function uploadProfileAvatarToBunny(
  userId: string,
  fileBytes: Uint8Array,
  contentType: string,
): Promise<BunnyAvatarUpload> {
  const config = getBunnyStorageConfig();
  if (!config) {
    throw new Error("Bunny.net storage is not configured");
  }

  const extension = extensionFromContentType(contentType);
  const objectKey = buildAvatarObjectKey(userId, extension);
  const uploadUrl = buildObjectDeleteUrl(config, objectKey);

  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      AccessKey: config.accessKey,
      "Content-Type": contentType,
    },
    body: Buffer.from(fileBytes),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Bunny upload failed (${response.status})${detail ? `: ${detail}` : ""}`,
    );
  }

  return {
    objectKey,
    cdnUrl: buildListingCdnUrl(config, objectKey),
  };
}

export async function uploadReportEvidenceToBunny(
  userId: string,
  fileBytes: Uint8Array,
  contentType: string,
): Promise<BunnyListingUpload> {
  const config = getBunnyStorageConfig();
  if (!config) {
    throw new Error("Bunny.net storage is not configured");
  }

  const extension = extensionFromContentType(contentType);
  const objectKey = buildReportEvidenceObjectKey(userId, extension);
  const uploadUrl = buildObjectDeleteUrl(config, objectKey);

  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      AccessKey: config.accessKey,
      "Content-Type": contentType,
    },
    body: Buffer.from(fileBytes),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Bunny upload failed (${response.status})${detail ? `: ${detail}` : ""}`,
    );
  }

  return {
    objectKey,
    cdnUrl: buildListingCdnUrl(config, objectKey),
  };
}

export async function uploadMerchantShopAvatarToBunny(
  merchantId: string,
  fileBytes: Uint8Array,
  contentType: string,
): Promise<BunnyAvatarUpload> {
  const config = getBunnyStorageConfig();
  if (!config) {
    throw new Error("Bunny.net storage is not configured");
  }

  const extension = extensionFromContentType(contentType);
  const objectKey = buildShopAvatarObjectKey(merchantId, extension);
  const uploadUrl = buildObjectDeleteUrl(config, objectKey);

  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      AccessKey: config.accessKey,
      "Content-Type": contentType,
    },
    body: Buffer.from(fileBytes),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Bunny upload failed (${response.status})${detail ? `: ${detail}` : ""}`,
    );
  }

  return {
    objectKey,
    cdnUrl: buildListingCdnUrl(config, objectKey),
  };
}

export async function uploadMerchantShopBannerToBunny(
  merchantId: string,
  fileBytes: Uint8Array,
  contentType: string,
): Promise<BunnyAvatarUpload> {
  const config = getBunnyStorageConfig();
  if (!config) {
    throw new Error("Bunny.net storage is not configured");
  }

  const extension = extensionFromContentType(contentType);
  const objectKey = buildShopBannerObjectKey(merchantId, extension);
  const uploadUrl = buildObjectDeleteUrl(config, objectKey);

  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      AccessKey: config.accessKey,
      "Content-Type": contentType,
    },
    body: Buffer.from(fileBytes),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Bunny upload failed (${response.status})${detail ? `: ${detail}` : ""}`,
    );
  }

  return {
    objectKey,
    cdnUrl: buildListingCdnUrl(config, objectKey),
  };
}

export async function uploadAnnouncementPosterToBunny(
  announcementId: string,
  fileBytes: Uint8Array,
  contentType: string,
): Promise<BunnyListingUpload> {
  const config = getBunnyStorageConfig();
  if (!config) {
    throw new Error("Bunny.net storage is not configured");
  }

  const extension = extensionFromContentType(contentType);
  const objectKey = buildAnnouncementPosterObjectKey(announcementId, extension);
  const uploadUrl = buildObjectDeleteUrl(config, objectKey);

  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      AccessKey: config.accessKey,
      "Content-Type": contentType,
    },
    body: Buffer.from(fileBytes),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Bunny upload failed (${response.status})${detail ? `: ${detail}` : ""}`,
    );
  }

  return {
    objectKey,
    cdnUrl: buildListingCdnUrl(config, objectKey),
  };
}

/** Best-effort cleanup when replacing or deleting an announcement poster. */
export async function deleteAnnouncementPosterFromBunny(
  objectKey: string,
): Promise<void> {
  const config = getBunnyStorageConfig();
  if (!config || !objectKey.trim()) return;

  const response = await fetch(buildObjectDeleteUrl(config, objectKey), {
    method: "DELETE",
    headers: {
      AccessKey: config.accessKey,
    },
  });

  if (!response.ok && response.status !== 404) {
    const detail = await response.text().catch(() => "");
    console.error(
      `[deleteAnnouncementPosterFromBunny] Bunny delete failed (${response.status})${detail ? `: ${detail}` : ""}`,
    );
  }
}

/** Best-effort cleanup when replacing a profile avatar on Bunny CDN. */
export async function deleteProfileAvatarFromBunny(
  objectKey: string,
): Promise<void> {
  const config = getBunnyStorageConfig();
  if (!config || !objectKey.trim()) return;

  const response = await fetch(buildObjectDeleteUrl(config, objectKey), {
    method: "DELETE",
    headers: {
      AccessKey: config.accessKey,
    },
  });

  if (!response.ok && response.status !== 404) {
    const detail = await response.text().catch(() => "");
    console.error(
      `[deleteProfileAvatarFromBunny] Bunny delete failed (${response.status})${detail ? `: ${detail}` : ""}`,
    );
  }
}

/** Best-effort rollback for listing images after a failed DB write. */
export async function deleteListingImagesFromBunny(
  objectKeys: string[],
): Promise<void> {
  const config = getBunnyStorageConfig();
  if (!config || objectKeys.length === 0) return;

  const results = await Promise.allSettled(
    objectKeys.map(async (objectKey) => {
      const response = await fetch(buildObjectDeleteUrl(config, objectKey), {
        method: "DELETE",
        headers: {
          AccessKey: config.accessKey,
        },
      });

      if (!response.ok && response.status !== 404) {
        const detail = await response.text().catch(() => "");
        throw new Error(
          `Bunny delete failed (${response.status})${detail ? `: ${detail}` : ""}`,
        );
      }
    }),
  );

  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length > 0) {
    console.error(
      "[deleteListingImagesFromBunny]",
      failures.map((result) =>
        result.status === "rejected" ? result.reason : null,
      ),
    );
  }
}
