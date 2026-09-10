import { describe, expect, it } from "vitest";
import {
  buildPlatformLegalDocumentValue,
  DEFAULT_PLATFORM_PRIVACY,
  DEFAULT_PLATFORM_TERMS,
  formatPlatformLegalUpdatedAt,
  parsePlatformLegalDocument,
  validatePlatformLegalBody,
} from "@/lib/platform/platform-legal-config";

describe("platform-legal-config", () => {
  it("parsePlatformLegalDocument returns valid document", () => {
    const parsed = parsePlatformLegalDocument(
      {
        title: "測試條款",
        body: "這是一段足夠長度的測試條款內容，超過二十個字元。",
      },
      DEFAULT_PLATFORM_TERMS,
    );
    expect(parsed.title).toBe("測試條款");
    expect(parsed.body).toBe("這是一段足夠長度的測試條款內容，超過二十個字元。");
  });

  it("parsePlatformLegalDocument falls back on invalid input", () => {
    expect(parsePlatformLegalDocument(null, DEFAULT_PLATFORM_TERMS)).toEqual(
      DEFAULT_PLATFORM_TERMS,
    );
    expect(
      parsePlatformLegalDocument({ title: "", body: "short" }, DEFAULT_PLATFORM_TERMS),
    ).toEqual(DEFAULT_PLATFORM_TERMS);
  });

  it("buildPlatformLegalDocumentValue merges patch", () => {
    const built = buildPlatformLegalDocumentValue(
      {
        title: "舊標題",
        body: "舊內容足夠長度超過二十個字元以上的測試正文。",
      },
      { body: "新內容足夠長度超過二十個字元以上的測試正文。" },
      DEFAULT_PLATFORM_TERMS,
    );
    expect(built.title).toBe("舊標題");
    expect(built.body).toBe("新內容足夠長度超過二十個字元以上的測試正文。");
  });

  it("default bodies are non-empty", () => {
    expect(DEFAULT_PLATFORM_TERMS.body.length).toBeGreaterThan(20);
    expect(DEFAULT_PLATFORM_PRIVACY.body.length).toBeGreaterThan(20);
  });

  it("validatePlatformLegalBody rejects short body", () => {
    expect(validatePlatformLegalBody("too short")).toBeTruthy();
    expect(validatePlatformLegalBody(DEFAULT_PLATFORM_TERMS.body)).toBeNull();
  });

  it("formatPlatformLegalUpdatedAt formats ISO date", () => {
    expect(formatPlatformLegalUpdatedAt("2026-08-01T00:00:00.000Z")).toMatch(
      /2026/,
    );
    expect(formatPlatformLegalUpdatedAt(null)).toBe("—");
    expect(formatPlatformLegalUpdatedAt("invalid")).toBe("—");
  });
});
