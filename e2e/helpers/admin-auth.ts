import { expect, type Browser, type Page } from "@playwright/test";

function readEnv(key: string): string | undefined {
  return process.env[key]?.trim() || undefined;
}

export function hasAdminAuthFixtures(): boolean {
  return Boolean(readEnv("E2E_ADMIN_EMAIL") && readEnv("E2E_ADMIN_PASSWORD"));
}

export async function loginAsAdmin(page: Page): Promise<void> {
  const email = readEnv("E2E_ADMIN_EMAIL");
  const password = readEnv("E2E_ADMIN_PASSWORD");
  if (!email || !password) {
    throw new Error("Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD");
  }

  await page.goto("/auth", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(
    (url) =>
      url.pathname === "/admin" || url.pathname.startsWith("/admin/"),
    { timeout: 30_000 },
  );
}

export async function withAdminPage(
  browser: Browser,
  run: (page: Page) => Promise<void>,
): Promise<void> {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await loginAsAdmin(page);
    await run(page);
  } finally {
    await context.close();
  }
}

export async function gotoAdminPage(
  page: Page,
  path: string,
): Promise<Awaited<ReturnType<Page["goto"]>>> {
  return page.goto(path, { waitUntil: "domcontentloaded" });
}
