import { createClient } from "@supabase/supabase-js";
import { test, expect, type Browser, type Page } from "@playwright/test";
import type { Database } from "@/types/supabase";
import { gotoAdminPage, hasAdminAuthFixtures, loginAsAdmin } from "./helpers/admin-auth";

const E2E_TITLE_PREFIX = "E2E_ANNOUNCEMENT_";

function createE2eAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return createClient<Database>(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function deleteAnnouncementsByTitlePrefix(prefix: string): Promise<void> {
  const admin = createE2eAdminClient();
  const { data, error } = await admin
    .from("platform_announcements")
    .select("id, title")
    .ilike("title", `${prefix}%`);

  if (error) {
    throw new Error(`[deleteAnnouncementsByTitlePrefix] ${error.message}`);
  }

  const ids = (data ?? []).map((row) => row.id);
  if (ids.length === 0) {
    return;
  }

  const { error: deleteError } = await admin
    .from("platform_announcements")
    .delete()
    .in("id", ids);

  if (deleteError) {
    throw new Error(`[deleteAnnouncementsByTitlePrefix] ${deleteError.message}`);
  }
}

test.describe("Admin announcements workflow", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  const runId = String(Date.now());
  const initialTitle = `${E2E_TITLE_PREFIX}${runId}`;
  const updatedTitle = `${initialTitle}_UPDATED`;

  test.afterAll(async () => {
    await deleteAnnouncementsByTitlePrefix(E2E_TITLE_PREFIX);
  });

  test("admin create/edit and guest homepage modal", async ({
    page,
    browser,
  }: {
    page: Page;
    browser: Browser;
  }) => {
    test.setTimeout(90_000);

    if (!hasAdminAuthFixtures()) {
      test.skip(true, "Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD");
    }

    await loginAsAdmin(page);
    await gotoAdminPage(page, "/admin/announcements");
    await expect(page.getByText("載入公告中…")).toHaveCount(0, {
      timeout: 20_000,
    });

    await page.getByRole("link", { name: "新增公告" }).click();
    await expect(page).toHaveURL(/\/admin\/announcements\/new/, {
      timeout: 10_000,
    });

    await page.getByPlaceholder("公告標題").fill(initialTitle);
    await page
      .getByPlaceholder("公告內文")
      .fill("E2E announcement body for automated workflow verification.");
    await page.getByPlaceholder("/catalog 或 URL").fill("/catalog");

    await page.getByRole("button", { name: "新增公告" }).click();
    await expect(page.getByText("已成功新增公告！")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(initialTitle)).toBeVisible();

    const row = page
      .locator("article")
      .filter({ hasText: initialTitle })
      .first();
    await row.getByRole("link", { name: "編輯" }).click();
    await expect(page).toHaveURL(/\/admin\/announcements\/[^/]+\/edit/, {
      timeout: 10_000,
    });
    await expect(page.getByRole("button", { name: "儲存變更" })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByPlaceholder("公告標題").fill(updatedTitle);
    await page.getByRole("button", { name: "儲存變更" }).click();
    await expect(page.getByText("已成功更新公告！")).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByRole("heading", { name: updatedTitle, level: 3 }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(updatedTitle)).toBeVisible();

    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    await guestPage.addInitScript(() => {
      sessionStorage.removeItem("hasSeenAnnouncementsModal");
    });
    await guestPage.goto("/");
    const dialog = guestPage.getByRole("dialog");
    await expect(dialog).toContainText(updatedTitle, {
      timeout: 5_000,
    });

    const announcementSlide = dialog
      .locator("div")
      .filter({ hasText: updatedTitle })
      .first();
    const detailLink = announcementSlide.getByRole("link", {
      name: "查看詳情",
    });
    await expect(detailLink).toBeVisible();
    const detailHref = await detailLink.getAttribute("href");
    expect(detailHref).toContain("/catalog");
    await guestPage.goto(detailHref ?? "/catalog");
    await guestPage.waitForURL((url) => url.pathname.includes("/catalog"), {
      timeout: 10_000,
    });

    await guestContext.close();
  });
});
