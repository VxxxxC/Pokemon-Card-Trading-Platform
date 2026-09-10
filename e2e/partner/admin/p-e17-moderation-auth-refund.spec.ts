// @partner-id P-E17
// @features F-A-02, F-S-08
// @path Partner — I-H2 / I-H3 moderation auth refund admin UI

import { test } from "@playwright/test";
import {
  assertMemberOrderRefundSagaStarted,
  assertMerchantOrderRefundSagaStarted,
  assertModerationAuthOrderRefundEligible,
  getMemberOrderNumber,
  getMerchantOrderNumber,
  hasModerationAuthRefundE2eEnv,
  resolveAdminDisputeWithSellerFaultRefund,
  seedMemberAuthRefundOrderForE2e,
  seedMerchantAuthRefundOrderForE2e,
  seedModerationCaseForAuthRefund,
  wipeModerationCasesForSubject,
} from "../../helpers/moderation-auth-refund-partner";

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(240_000);

test.describe("P-E17 moderation auth refund admin UI", () => {
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

  test("I-H2 Partner merchant_auth admin refund prepares processing", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Admin login on buyer project");
    test.skip(
      !hasModerationAuthRefundE2eEnv(),
      "Missing moderation auth refund E2E env",
    );

    const seed = await seedMerchantAuthRefundOrderForE2e({
      runId,
      suffix: "H2",
    });
    merchantSubjectId = seed.merchantId;
    await assertModerationAuthOrderRefundEligible(seed.orderId, "merchant_auth");

    const { caseId } = await seedModerationCaseForAuthRefund({
      orderId: seed.orderId,
      subjectId: seed.merchantId,
      buyerId: seed.buyerId,
      runId,
      suffix: "H2",
      contextType: "merchant_order",
    });

    const orderNumber = await getMerchantOrderNumber(seed.orderId);
    await resolveAdminDisputeWithSellerFaultRefund(page, {
      caseId,
      orderNumber,
      violationPersona: "Merchant",
    });

    await assertMerchantOrderRefundSagaStarted(seed.orderId);
  });

  test("I-H3 Partner member_auth admin refund prepares processing", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Admin login on buyer project");
    test.skip(
      !hasModerationAuthRefundE2eEnv(),
      "Missing moderation auth refund E2E env",
    );

    const seed = await seedMemberAuthRefundOrderForE2e({
      runId,
      suffix: "H3",
    });
    memberSubjectId = seed.sellerId;
    await assertModerationAuthOrderRefundEligible(seed.orderId, "member_auth");

    const { caseId } = await seedModerationCaseForAuthRefund({
      orderId: seed.orderId,
      subjectId: seed.sellerId,
      buyerId: seed.buyerId,
      runId,
      suffix: "H3",
      contextType: "member_order",
    });

    const orderNumber = await getMemberOrderNumber(seed.orderId);
    await resolveAdminDisputeWithSellerFaultRefund(page, {
      caseId,
      orderNumber,
      violationPersona: "Member",
    });

    await assertMemberOrderRefundSagaStarted(seed.orderId);
  });
});
