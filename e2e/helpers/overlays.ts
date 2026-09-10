import type { Page } from "@playwright/test";

async function clickIfVisible(
  locator: ReturnType<Page["getByRole"]>,
): Promise<boolean> {
  if (await locator.isVisible().catch(() => false)) {
    await locator.click({ force: true, timeout: 3_000 }).catch(() => undefined);
    return true;
  }
  return false;
}

export async function dismissRewardUnlockedModal(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog", { name: "恭喜解鎖獎勵" });
  const title = page.getByText("恭喜解鎖獎勵", { exact: true });
  const confirm = page.getByRole("button", { name: /太好了|處理中/ });
  const close = dialog.getByRole("button", { name: "Close" });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const visible =
      (await dialog.isVisible().catch(() => false)) ||
      (await title.isVisible().catch(() => false));
    if (!visible) {
      return;
    }
    await confirm
      .first()
      .click({ force: true, timeout: 5_000 })
      .catch(() => undefined);
    if (await dialog.isVisible().catch(() => false)) {
      await close
        .click({ force: true, timeout: 3_000 })
        .catch(() => undefined);
    }
    await page.waitForTimeout(400);
  }
}

export async function suppressTransientHomeOverlays(page: Page): Promise<void> {
  await page.addInitScript(() => {
    sessionStorage.setItem("hasSeenAnnouncementsModal", "true");
    localStorage.setItem(
      "pwa_snooze_until",
      String(Date.now() + 3 * 24 * 60 * 60 * 1000),
    );
  });
}

async function isReportOutcomeDialogOpen(page: Page): Promise<boolean> {
  return page
    .getByRole("alertdialog", { name: "舉報結果通知" })
    .isVisible()
    .catch(() => false);
}

export async function dismissReportOutcomeNotifications(
  page: Page,
): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const reportDialog = page.getByRole("alertdialog", {
      name: "舉報結果通知",
    });
    if (!(await reportDialog.isVisible().catch(() => false))) {
      return;
    }

    await reportDialog
      .getByRole("button", { name: /我知道了|處理中/ })
      .click({ force: true, timeout: 5_000 })
      .catch(() => undefined);
    await page.waitForTimeout(400);
  }
}

export async function waitUntilNoBlockingOverlay(page: Page): Promise<void> {
  await page.waitForTimeout(700);
  for (let attempt = 0; attempt < 16; attempt += 1) {
    await dismissBlockingOverlays(page);
    await dismissReportOutcomeNotifications(page);
    const overlayVisible = await page
      .locator("div.fixed.inset-0.z-\\[400\\]")
      .first()
      .isVisible()
      .catch(() => false);
    const announcementOpen =
      (await page
        .getByRole("dialog", { name: "最新活動與公告" })
        .count()
        .catch(() => 0)) > 0;
    const rewardOpen =
      (await page
        .getByRole("dialog", { name: "恭喜解鎖獎勵" })
        .isVisible()
        .catch(() => false)) ||
      (await page.getByText("恭喜解鎖獎勵", { exact: true }).isVisible().catch(() => false));
    const reportOutcomeOpen = await isReportOutcomeDialogOpen(page);
    if (!overlayVisible && !announcementOpen && !rewardOpen && !reportOutcomeOpen) {
      return;
    }
    await page.waitForTimeout(300);
  }
}

export async function dismissBlockingOverlays(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    let dismissed = false;

    await dismissRewardUnlockedModal(page);

    const announcementDialog = page.getByRole("dialog", {
      name: "最新活動與公告",
    });
    if (
      await clickIfVisible(
        announcementDialog.getByRole("button", { name: "關閉視窗" }),
      )
    ) {
      dismissed = true;
    } else if (
      await clickIfVisible(
        announcementDialog.getByRole("button", { name: "Close" }),
      )
    ) {
      dismissed = true;
    }

    if (
      await clickIfVisible(page.getByRole("button", { name: "稍後再說" }))
    ) {
      dismissed = true;
    }

    const reportDialog = page.getByRole("alertdialog", {
      name: "舉報結果通知",
    });
    if (
      await clickIfVisible(
        reportDialog.getByRole("button", { name: /我知道了|處理中/ }),
      )
    ) {
      dismissed = true;
    }

    if (await page.getByText("安裝方法").isVisible().catch(() => false)) {
      const safariInstallClose = page
        .locator("button")
        .filter({ hasText: "✕" })
        .first();
      if (await clickIfVisible(safariInstallClose)) {
        dismissed = true;
      }
    }

    const pwaInstallModal = page
      .locator("div.fixed.inset-0")
      .filter({ hasText: "安裝方法" })
      .first();
    if (await pwaInstallModal.isVisible().catch(() => false)) {
      const pwaClose = pwaInstallModal.getByRole("button", { name: "✕" });
      if (await clickIfVisible(pwaClose)) {
        dismissed = true;
      } else {
        await pwaInstallModal
          .click({ position: { x: 8, y: 8 }, force: true, timeout: 3_000 })
          .catch(() => undefined);
        dismissed = true;
      }
    }

    const blockingOverlay = page.locator("div.fixed.inset-0.z-\\[400\\]").first();
    if (await blockingOverlay.isVisible().catch(() => false)) {
      const backdrop = blockingOverlay.locator("div.absolute.inset-0").first();
      if (await backdrop.isVisible().catch(() => false)) {
        await backdrop
          .click({ force: true, timeout: 3_000 })
          .catch(() => undefined);
        dismissed = true;
      }
      await page.keyboard.press("Escape").catch(() => undefined);
      const overlayClose = blockingOverlay.getByRole("button", {
        name: /✕|關閉視窗|Close/,
      });
      if (await clickIfVisible(overlayClose)) {
        dismissed = true;
      }
    }

    if (await clickIfVisible(page.getByRole("button", { name: "關閉視窗" }))) {
      dismissed = true;
    }

    const chatConsole = page.locator('[data-chat-console="true"]').last();
    if (await chatConsole.isVisible().catch(() => false)) {
      const chatClose = chatConsole.locator("button").filter({ hasText: "✕" }).first();
      if (await clickIfVisible(chatClose)) {
        dismissed = true;
      }
    }

    const chatOpen = await page
      .locator('[data-chat-console="true"]')
      .last()
      .isVisible()
      .catch(() => false);

    if (!dismissed) {
      if (!chatOpen) {
        await page.keyboard.press("Escape").catch(() => undefined);
      }
      break;
    }

    await page.waitForTimeout(300);
  }
}
