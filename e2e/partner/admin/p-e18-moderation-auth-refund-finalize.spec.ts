// @partner-id P-E18
// @features F-A-02, F-S-08
// @path Partner — I-H2M / I-H10 moderation auth refund finalize

import { test, expect } from "@playwright/test";
import {
  assertMemberAuthRefundTerminal,
  assertMerchantAuthRefundTerminal,
  assertModerationAuthOrderRefundEligible,
  finalizeModerationAuthRefundTerminal,
  getMemberOrderNumber,
  getMerchantOrderNumber,
  hasModerationAuthRefundE2eEnv,
  seedMemberAuthRefundOrderForE2e,
  seedMerchantAuthRefundOrderForE2e,
  seedModerationCaseForAuthRefund,
  wipeModerationCasesForSubject,
} from "../../helpers/moderation-auth-refund-partner";
import { gotoAdminPage, loginAsAdmin } from "../../helpers/admin-auth";

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(240_000);

async function assertAdminDisputeRefundPanel(
  page: import("@playwright/test").Page,
  caseId: string,
  orderNumber: string,
): Promise<void> {
  await loginAsAdmin(page);
  await gotoAdminPage(page, `/admin/disputes/${caseId}`);
  await expect(
    page.getByRole("heading", { name: "仲裁判定動作" }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByRole("heading", { name: "關聯訂單" }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(orderNumber)).toBeVisible({ timeout: 15_000 });
}

test.describe("P-E18 moderation auth refund finalize", () => {
  const runId = String(Date.now());
  let merchantSubjectId: string | null = null;
  let memberSubjectId: string | null = null;

  test.afterAll(async () => {
    if (merchantSubjectId) {
      await wipeModerationCasesForSubject(merchantSubjectId).catch(() => undefined);
    }
    if (memberSubjectId) {
      await wipeModerationCasesForSubject(memberSubjectId).catch(() => undefined);
    }
  });

  test("I-H2M Partner merchant_auth admin case UI + finalize → refunded", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Admin login on buyer project");
    test.skip(
      !hasModerationAuthRefundE2eEnv(),
      "Missing moderation auth refund E2E env",
    );

    const seed = await seedMerchantAuthRefundOrderForE2e({
      runId,
      suffix: "H2M",
    });
    merchantSubjectId = seed.merchantId;
    await assertModerationAuthOrderRefundEligible(seed.orderId, "merchant_auth");

    const { caseId } = await seedModerationCaseForAuthRefund({
      orderId: seed.orderId,
      subjectId: seed.merchantId,
      buyerId: seed.buyerId,
      runId,
      suffix: "H2M",
      contextType: "merchant_order",
    });

    const orderNumber = await getMerchantOrderNumber(seed.orderId);
    await assertAdminDisputeRefundPanel(page, caseId, orderNumber);

    const refundId = await finalizeModerationAuthRefundTerminal({
      caseId,
      orderId: seed.orderId,
      orderKind: "merchant_auth",
      runId,
      suffix: "H2M",
    });

    await assertMerchantAuthRefundTerminal(seed.orderId, refundId);
  });

  test("I-H10 Partner member_auth admin case UI + finalize → refunded", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Admin login on buyer project");
    test.skip(
      !hasModerationAuthRefundE2eEnv(),
      "Missing moderation auth refund E2E env",
    );

    const seed = await seedMemberAuthRefundOrderForE2e({
      runId,
      suffix: "H10",
    });
    memberSubjectId = seed.sellerId;
    await assertModerationAuthOrderRefundEligible(seed.orderId, "member_auth");

    const { caseId } = await seedModerationCaseForAuthRefund({
      orderId: seed.orderId,
      subjectId: seed.sellerId,
      buyerId: seed.buyerId,
      runId,
      suffix: "H10",
      contextType: "member_order",
    });

    const orderNumber = await getMemberOrderNumber(seed.orderId);
    await assertAdminDisputeRefundPanel(page, caseId, orderNumber);

    const refundId = await finalizeModerationAuthRefundTerminal({
      caseId,
      orderId: seed.orderId,
      orderKind: "member_auth",
      runId,
      suffix: "H10",
    });

    await assertMemberAuthRefundTerminal(seed.orderId, refundId);
  });
});
