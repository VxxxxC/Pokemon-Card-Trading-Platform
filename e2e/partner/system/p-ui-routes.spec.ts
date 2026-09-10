// @partner-id P-UI-L2
// @path Partner (L2 UI route inventory — reads docs/dev/ui-feature-map.json)

import { test } from "@playwright/test";
import {
  getL2Surfaces,
  loadUiFeatureMap,
  resolveSurfacePath,
} from "@/lib/dev/ui-feature-map";
import { hasAdminAuthFixtures } from "../../fixtures/test-data";
import { loginAsAdmin } from "../../helpers/admin-auth";
import { ensureMemberPersona, ensureMerchantPersona } from "../../helpers/collection-asset";
import {
  assertRequiredElements,
  assertStateVariants,
  assertUiSurface,
  projectMatchesSurfaceRole,
} from "../../helpers/ui-feature-map-playwright";
import { dismissBlockingOverlays, suppressTransientHomeOverlays, waitUntilNoBlockingOverlay } from "../../helpers/overlays";
import {
  acknowledgeAllReportOutcomesForReporter,
  getBuyerProfileIdFromEnv,
} from "../../fixtures/supabase-admin";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(90_000);

test.beforeAll(async () => {
  const buyerId = await getBuyerProfileIdFromEnv();
  if (buyerId) {
    await acknowledgeAllReportOutcomesForReporter(buyerId);
  }
});

const l2Surfaces = getL2Surfaces(loadUiFeatureMap().features);

for (const surface of l2Surfaces) {
  test(`L2 ${surface.id} @ ${surface.path} (${surface.role})`, async ({
    page,
  }, testInfo) => {
    test.skip(
      !projectMatchesSurfaceRole(testInfo.project.name, surface.role),
      `${surface.role}-only L2 surface`,
    );

    if (surface.role === "admin") {
      test.skip(!hasAdminAuthFixtures(), "Missing admin credentials");
      await loginAsAdmin(page);
    }

    const resolvedPath = resolveSurfacePath(surface.path);
    test.skip(!resolvedPath, `Missing env for dynamic path ${surface.path}`);
    const pathToVisit = resolvedPath!;

    if (pathToVisit.startsWith("/profile/user")) {
      if (surface.role === "buyer" || surface.role === "seller") {
        await ensureMemberPersona(page);
      }
    }
    if (pathToVisit.startsWith("/profile/merchant") && surface.role === "seller") {
      await ensureMerchantPersona(page);
    }

    if (pathToVisit === "/") {
      await suppressTransientHomeOverlays(page);
    }

    await page.goto(pathToVisit, { waitUntil: "domcontentloaded" });
    await dismissBlockingOverlays(page);
    await waitUntilNoBlockingOverlay(page);
    await assertUiSurface(page, surface.assertions);
    if (surface.requiredElements?.length) {
      await assertRequiredElements(page, surface.requiredElements);
    }
    if (surface.stateVariants?.length) {
      await assertStateVariants(page, surface.stateVariants);
    }
  });
}
