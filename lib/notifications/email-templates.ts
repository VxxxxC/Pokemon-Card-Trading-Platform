import { EMAIL_SITE_NAME } from "@/lib/email/constants";
import {
  buildBrandedEmailHtml,
  buildBrandedEmailText,
  type BrandedEmailLayoutInput,
} from "@/lib/email/layout";

export type EmailTemplateRenderInput = {
  templateKey: string;
  payload?: Record<string, unknown>;
  siteUrl?: string;
};

export type EmailTemplateRenderResult = {
  subject: string;
  html: string;
  text: string;
};

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatHkd(amount: number): string {
  return `HK$${amount.toLocaleString("en-HK", { maximumFractionDigits: 0 })}`;
}

function renderFromLayout(
  subject: string,
  layout: BrandedEmailLayoutInput,
  payload?: Record<string, unknown>,
): EmailTemplateRenderResult {
  const logoUrl = asString(payload?.logoUrl);
  const mergedLayout = logoUrl ? { ...layout, logoUrl } : layout;
  return {
    subject,
    html: buildBrandedEmailHtml(mergedLayout),
    text: buildBrandedEmailText(mergedLayout),
  };
}

function renderAccPasswordChanged(
  payload?: Record<string, unknown>,
): EmailTemplateRenderResult {
  return renderFromLayout("您的密碼已更新", {
    title: "您的密碼已更新",
    preheader: "您的 Cardvault HK 帳戶密碼已成功更新",
    headline: "密碼已更新",
    bodyLines: [
      "您的 Cardvault HK 帳戶密碼已成功更新。",
      "如非本人操作，請立即聯絡客服並更改密碼。",
    ],
    footerLines: [
      EMAIL_SITE_NAME,
      "此為帳戶安全通知，請勿回覆此郵件。",
    ],
  }, payload);
}

function renderOfferReceived(
  payload?: Record<string, unknown>,
): EmailTemplateRenderResult {
  const cardName = asString(payload?.cardName, "商品");
  const buyerName = asString(payload?.buyerName, "買家");
  const offerPriceLabel =
    asString(payload?.offerPriceLabel) ||
    formatHkd(asNumber(payload?.offerPrice));
  const actionUrl = asString(payload?.actionUrl);

  return renderFromLayout(`新叫價通知：${cardName}`, {
    title: `新叫價通知：${cardName}`,
    preheader: `${buyerName} 對「${cardName}」出價 ${offerPriceLabel}`,
    headline: "你收到新叫價",
    bodyLines: [
      `${buyerName} 對「${cardName}」出價 ${offerPriceLabel}。`,
      "請登入平台查看並回覆買家。",
    ],
    primaryAction: actionUrl
      ? { label: "查看議價", href: actionUrl }
      : undefined,
  }, payload);
}

function renderOfferAccepted(
  payload?: Record<string, unknown>,
): EmailTemplateRenderResult {
  const cardName = asString(payload?.cardName, "商品");
  const sellerName = asString(payload?.sellerName, "賣家");
  const offerPriceLabel =
    asString(payload?.offerPriceLabel) ||
    formatHkd(asNumber(payload?.offerPrice));
  const actionUrl = asString(payload?.actionUrl);

  return renderFromLayout(`出價已接受：${cardName}`, {
    title: `出價已接受：${cardName}`,
    preheader: `${sellerName} 已接受你對「${cardName}」的出價`,
    headline: "出價已接受",
    bodyLines: [
      `${sellerName} 已接受你對「${cardName}」的出價 ${offerPriceLabel}。`,
      "請盡快完成付款，以免訂單逾時取消。",
    ],
    primaryAction: actionUrl
      ? { label: "前往付款", href: actionUrl }
      : undefined,
  }, payload);
}

function renderOfferCountered(
  payload?: Record<string, unknown>,
): EmailTemplateRenderResult {
  const cardName = asString(payload?.cardName, "商品");
  const buyerName = asString(payload?.buyerName, "買家");
  const offerPriceLabel =
    asString(payload?.offerPriceLabel) ||
    formatHkd(asNumber(payload?.offerPrice));
  const actionUrl = asString(payload?.actionUrl);

  return renderFromLayout(`出價已更新：${cardName}`, {
    title: `出價已更新：${cardName}`,
    preheader: `${buyerName} 將出價更新為 ${offerPriceLabel}`,
    headline: "買家已修改出價",
    bodyLines: [
      `${buyerName} 將「${cardName}」的出價更新為 ${offerPriceLabel}。`,
      "請登入平台查看並回覆買家。",
    ],
    primaryAction: actionUrl
      ? { label: "查看議價", href: actionUrl }
      : undefined,
  }, payload);
}

function renderOfferRejected(
  payload?: Record<string, unknown>,
): EmailTemplateRenderResult {
  const cardName = asString(payload?.cardName, "商品");
  const sellerName = asString(payload?.sellerName, "賣家");
  const offerPriceLabel =
    asString(payload?.offerPriceLabel) ||
    formatHkd(asNumber(payload?.offerPrice));
  const actionUrl = asString(payload?.actionUrl);

  return renderFromLayout(`出價未成交：${cardName}`, {
    title: `出價未成交：${cardName}`,
    preheader: `${sellerName} 拒絕了你對「${cardName}」的出價`,
    headline: "出價未成交",
    bodyLines: [
      `${sellerName} 拒絕了你對「${cardName}」的出價 ${offerPriceLabel}。`,
      "你可以調整價格後再次出價，或瀏覽其他掛單。",
    ],
    primaryAction: actionUrl
      ? { label: "查看交易", href: actionUrl }
      : undefined,
  }, payload);
}

function renderBuyNowSeller(
  payload?: Record<string, unknown>,
): EmailTemplateRenderResult {
  const cardName = asString(payload?.cardName, "商品");
  const buyerName = asString(payload?.buyerName, "買家");
  const offerPriceLabel =
    asString(payload?.offerPriceLabel) ||
    formatHkd(asNumber(payload?.offerPrice));
  const actionUrl = asString(payload?.actionUrl);

  return renderFromLayout(`立即購買訂單：${cardName}`, {
    title: `立即購買訂單：${cardName}`,
    preheader: `${buyerName} 已立即購買「${cardName}」`,
    headline: "買家已立即購買",
    bodyLines: [
      `${buyerName} 已立即購買「${cardName}」，成交價 ${offerPriceLabel}。`,
      "請留意訂單狀態並按流程處理。",
    ],
    primaryAction: actionUrl
      ? { label: "查看訂單", href: actionUrl }
      : undefined,
  }, payload);
}

function renderOrderPaymentConfirmed(
  payload?: Record<string, unknown>,
): EmailTemplateRenderResult {
  const cardName = asString(payload?.cardName, "商品");
  const amountLabel = asString(payload?.amountLabel, "HK$0");
  const counterpartyName = asString(payload?.counterpartyName, "對方");
  const actionUrl = asString(payload?.actionUrl);
  const recipientRole = asString(payload?.recipientRole, "buyer");
  const orderNumber = asString(payload?.orderNumber);

  if (recipientRole === "seller") {
    const bodyLines = [
      `${counterpartyName} 已就「${cardName}」完成付款 ${amountLabel}。`,
      ...(orderNumber ? [`訂單編號：${orderNumber}`] : []),
      "款項由平台託管，請按訂單流程處理。",
    ];

    return renderFromLayout(`買家已付款：${cardName}`, {
      title: `買家已付款：${cardName}`,
      preheader: `${counterpartyName} 已完成付款 ${amountLabel}`,
      headline: "買家已付款",
      bodyLines,
      primaryAction: actionUrl
        ? { label: "查看訂單", href: actionUrl }
        : undefined,
    }, payload);
  }

  const buyerBodyLines = [
    `你已成功就「${cardName}」付款 ${amountLabel}。`,
    ...(orderNumber ? [`訂單編號：${orderNumber}`] : []),
    "款項由平台託管，賣家將按流程處理訂單。",
  ];

  return renderFromLayout(`付款成功：${cardName}`, {
    title: `付款成功：${cardName}`,
    preheader: `你已成功付款 ${amountLabel}`,
    headline: "付款成功",
    bodyLines: buyerBodyLines,
    primaryAction: actionUrl
      ? { label: "查看訂單", href: actionUrl }
      : undefined,
  }, payload);
}

function renderOrderPaymentExpired(
  payload?: Record<string, unknown>,
): EmailTemplateRenderResult {
  const cardName = asString(payload?.cardName, "商品");
  const amountLabel = asString(payload?.amountLabel, "HK$0");
  const counterpartyName = asString(payload?.counterpartyName, "對方");
  const actionUrl = asString(payload?.actionUrl);
  const recipientRole = asString(payload?.recipientRole, "buyer");
  const orderNumber = asString(payload?.orderNumber);

  if (recipientRole === "seller") {
    const bodyLines = [
      `訂單「${cardName}」（${amountLabel}）因買家逾期未付款已自動取消。`,
      ...(orderNumber ? [`訂單編號：${orderNumber}`] : []),
      "掛單已恢復可供其他買家購買。",
    ];

    return renderFromLayout(`訂單已取消：${cardName}`, {
      title: `訂單已取消：${cardName}`,
      preheader: `買家逾期未付款，訂單已自動取消`,
      headline: "訂單已自動取消",
      bodyLines,
      primaryAction: actionUrl
        ? { label: "查看訂單", href: actionUrl }
        : undefined,
    }, payload);
  }

  const buyerBodyLines = [
    `你的訂單「${cardName}」（${amountLabel}）因逾期未付款已自動取消。`,
    ...(orderNumber ? [`訂單編號：${orderNumber}`] : []),
    "如需購買可重新下單或出價。",
  ];

  return renderFromLayout(`訂單已取消：${cardName}`, {
    title: `訂單已取消：${cardName}`,
    preheader: `逾期未付款，訂單已自動取消`,
    headline: "訂單已自動取消",
    bodyLines: buyerBodyLines,
    primaryAction: actionUrl
      ? { label: "查看交易", href: actionUrl }
      : undefined,
  }, payload);
}

function renderOrderShipped(
  payload?: Record<string, unknown>,
): EmailTemplateRenderResult {
  const cardName = asString(payload?.cardName, "商品");
  const sellerName = asString(payload?.sellerName, "賣家");
  const actionUrl = asString(payload?.actionUrl);
  const orderNumber = asString(payload?.orderNumber);
  const trackingNo = asString(payload?.trackingNo);
  const courierName = asString(payload?.courierName);

  const bodyLines = [
    `${sellerName} 已為「${cardName}」安排發貨。`,
    ...(orderNumber ? [`訂單編號：${orderNumber}`] : []),
    ...(trackingNo
      ? [
          courierName
            ? `物流：${courierName} · ${trackingNo}`
            : `物流單號：${trackingNo}`,
        ]
      : []),
    "收到商品後請於平台確認收貨。",
  ];

  return renderFromLayout(`賣家已發貨：${cardName}`, {
    title: `賣家已發貨：${cardName}`,
    preheader: `${sellerName} 已安排發貨`,
    headline: "賣家已發貨",
    bodyLines,
    primaryAction: actionUrl
      ? { label: "查看訂單", href: actionUrl }
      : undefined,
  }, payload);
}

function renderOrderBuyerConfirmed(
  payload?: Record<string, unknown>,
): EmailTemplateRenderResult {
  const cardName = asString(payload?.cardName, "商品");
  const buyerName = asString(payload?.buyerName, "買家");
  const actionUrl = asString(payload?.actionUrl);
  const orderNumber = asString(payload?.orderNumber);

  const bodyLines = [
    `${buyerName} 已確認收到「${cardName}」。`,
    ...(orderNumber ? [`訂單編號：${orderNumber}`] : []),
    "款項將按平台規則處理撥款或結算。",
  ];

  return renderFromLayout(`買家已確認收貨：${cardName}`, {
    title: `買家已確認收貨：${cardName}`,
    preheader: `${buyerName} 已確認收貨`,
    headline: "買家已確認收貨",
    bodyLines,
    primaryAction: actionUrl
      ? { label: "查看訂單", href: actionUrl }
      : undefined,
  }, payload);
}

function renderOrderCancelled(
  payload?: Record<string, unknown>,
): EmailTemplateRenderResult {
  const cardName = asString(payload?.cardName, "商品");
  const actionUrl = asString(payload?.actionUrl);
  const recipientRole = asString(payload?.recipientRole, "buyer");
  const orderNumber = asString(payload?.orderNumber);

  const bodyLines = [
    `「${cardName}」相關訂單已取消。`,
    ...(orderNumber ? [`訂單編號：${orderNumber}`] : []),
    recipientRole === "seller"
      ? "如有疑問請登入平台查看訂單詳情。"
      : "如需購買可重新下單或出價。",
  ];

  return renderFromLayout(`訂單已取消：${cardName}`, {
    title: `訂單已取消：${cardName}`,
    preheader: `訂單「${cardName}」已取消`,
    headline: "訂單已取消",
    bodyLines,
    primaryAction: actionUrl
      ? { label: "查看訂單", href: actionUrl }
      : undefined,
  }, payload);
}

function moderationResolutionLabel(resolution: string): string {
  switch (resolution) {
    case "upheld":
      return "舉報成立";
    case "dismissed":
      return "舉報不成立";
    case "insufficient_evidence":
      return "證據不足";
    default:
      return "已結案";
  }
}

function renderModReportOutcome(
  payload?: Record<string, unknown>,
): EmailTemplateRenderResult {
  const resolution = asString(payload?.resolution, "dismissed");
  const resolutionLabel =
    asString(payload?.resolutionLabel) || moderationResolutionLabel(resolution);
  const caseNumber = asString(payload?.caseNumber);
  const actionUrl = asString(payload?.actionUrl);

  const bodyLines = [
    `您的舉報案件已結案，裁定結果：${resolutionLabel}。`,
    ...(caseNumber ? [`案件編號：${caseNumber}`] : []),
    "感謝您協助維護平台交易安全。",
  ];

  return renderFromLayout(`舉報案件已結案：${resolutionLabel}`, {
    title: `舉報案件已結案：${resolutionLabel}`,
    preheader: `舉報裁定：${resolutionLabel}`,
    headline: "舉報案件已結案",
    bodyLines,
    primaryAction: actionUrl
      ? { label: "前往平台", href: actionUrl }
      : undefined,
  }, payload);
}

function renderPayoutCompleted(
  payload?: Record<string, unknown>,
): EmailTemplateRenderResult {
  const amountLabel = asString(payload?.amountLabel, "HK$0");
  const orderNumber = asString(payload?.orderNumber);
  const actionUrl = asString(payload?.actionUrl);

  const bodyLines = [
    `Stripe Connect 撥款 ${amountLabel} 已成功入帳。`,
    ...(orderNumber ? [`相關訂單：${orderNumber}`] : []),
    "款項已撥入您的 Connect 帳戶，請於財務中心查看詳情。",
  ];

  return renderFromLayout(`撥款成功：${amountLabel}`, {
    title: `撥款成功：${amountLabel}`,
    preheader: `Connect 撥款 ${amountLabel} 已入帳`,
    headline: "撥款成功",
    bodyLines,
    primaryAction: actionUrl
      ? { label: "查看財務中心", href: actionUrl }
      : undefined,
  }, payload);
}

function renderGradingC2cShipToPlatform(
  payload?: Record<string, unknown>,
): EmailTemplateRenderResult {
  const cardName = asString(payload?.cardName, "商品");
  const orderNumber = asString(payload?.orderNumber);
  const actionUrl = asString(payload?.actionUrl);

  const bodyLines = [
    `買家已付款，請將「${cardName}」寄往 Cardvault HK 平台倉庫進行鑑定。`,
    ...(orderNumber ? [`訂單編號：${orderNumber}`] : []),
    "請於訂單詳情填寫入庫物流單號。",
  ];

  return renderFromLayout(`請寄平台鑑定：${cardName}`, {
    title: `請寄平台鑑定：${cardName}`,
    preheader: "買家已付款，請寄卡牌至平台",
    headline: "請寄平台鑑定",
    bodyLines,
    primaryAction: actionUrl
      ? { label: "查看訂單", href: actionUrl }
      : undefined,
  }, payload);
}

function renderGradingB2cMerchantShipIn(
  payload?: Record<string, unknown>,
): EmailTemplateRenderResult {
  const cardName = asString(payload?.cardName, "商品");
  const orderNumber = asString(payload?.orderNumber);
  const actionUrl = asString(payload?.actionUrl);

  const bodyLines = [
    `買家已付款，請將「${cardName}」寄往 Cardvault HK 平台倉庫進行鑑定。`,
    ...(orderNumber ? [`訂單編號：${orderNumber}`] : []),
    "請於商戶訂單詳情填寫入庫物流單號。",
  ];

  return renderFromLayout(`請寄平台鑑定：${cardName}`, {
    title: `請寄平台鑑定：${cardName}`,
    preheader: "買家已付款，請寄商品至平台",
    headline: "請寄平台鑑定",
    bodyLines,
    primaryAction: actionUrl
      ? { label: "查看訂單", href: actionUrl }
      : undefined,
  }, payload);
}

function renderGradingPassedShipped(
  templateKey: string,
  payload?: Record<string, unknown>,
): EmailTemplateRenderResult {
  const cardName = asString(payload?.cardName, "商品");
  const orderNumber = asString(payload?.orderNumber);
  const trackingNo = asString(payload?.trackingNo);
  const actionUrl = asString(payload?.actionUrl);
  const recipientRole = asString(payload?.recipientRole, "buyer");
  const isMerchant = templateKey === "grading.b2c.passed_shipped";

  const bodyLines = [
    `「${cardName}」鑑定通過，平台已安排寄出給買家。`,
    ...(orderNumber ? [`訂單編號：${orderNumber}`] : []),
    ...(trackingNo ? [`物流單號：${trackingNo}`] : []),
    recipientRole === "seller"
      ? isMerchant
        ? "買家確認收貨後將按規則撥款。"
        : "買家確認收貨後款項將按規則釋放。"
      : "請留意物流並於收到後確認收貨。",
  ];

  return renderFromLayout(`鑑定通過已寄出：${cardName}`, {
    title: `鑑定通過已寄出：${cardName}`,
    preheader: `「${cardName}」鑑定通過並已寄出`,
    headline: "鑑定通過 — 已寄出",
    bodyLines,
    primaryAction: actionUrl
      ? { label: "查看訂單", href: actionUrl }
      : undefined,
  }, payload);
}

function renderGradingFailed(
  templateKey: string,
  payload?: Record<string, unknown>,
): EmailTemplateRenderResult {
  const cardName = asString(payload?.cardName, "商品");
  const orderNumber = asString(payload?.orderNumber);
  const actionUrl = asString(payload?.actionUrl);
  const recipientRole = asString(payload?.recipientRole, "buyer");
  const isMerchant = templateKey === "grading.b2c.failed";

  const bodyLines = [
    `「${cardName}」未能通過平台鑑定。`,
    ...(orderNumber ? [`訂單編號：${orderNumber}`] : []),
    recipientRole === "seller"
      ? isMerchant
        ? "平台將按規則處理退款或追償，請留意訂單更新。"
        : "平台將按規則處理退款，請留意訂單更新。"
      : "平台將按規則處理退款，請留意帳戶通知。",
  ];

  return renderFromLayout(`鑑定未通過：${cardName}`, {
    title: `鑑定未通過：${cardName}`,
    preheader: `「${cardName}」鑑定未通過`,
    headline: "鑑定未通過",
    bodyLines,
    primaryAction: actionUrl
      ? { label: "查看訂單", href: actionUrl }
      : undefined,
  }, payload);
}

function renderGradingC2cRefund(
  payload?: Record<string, unknown>,
): EmailTemplateRenderResult {
  const cardName = asString(payload?.cardName, "商品");
  const orderNumber = asString(payload?.orderNumber);
  const amountLabel = asString(payload?.amountLabel);
  const actionUrl = asString(payload?.actionUrl);

  const bodyLines = [
    `「${cardName}」鑑定失敗，退款正在處理或已完成。`,
    ...(orderNumber ? [`訂單編號：${orderNumber}`] : []),
    ...(amountLabel ? [`退款金額：${amountLabel}`] : []),
    "款項將退回原付款方式，實際入帳時間視銀行而定。",
  ];

  return renderFromLayout(`鑑定失敗退款：${cardName}`, {
    title: `鑑定失敗退款：${cardName}`,
    preheader: `「${cardName}」鑑定失敗退款處理中`,
    headline: "鑑定失敗 — 退款",
    bodyLines,
    primaryAction: actionUrl
      ? { label: "查看訂單", href: actionUrl }
      : undefined,
  }, payload);
}

function renderOfferExpired(
  payload?: Record<string, unknown>,
): EmailTemplateRenderResult {
  const cardName = asString(payload?.cardName, "商品");
  const offerPriceLabel = asString(payload?.offerPriceLabel);
  const reason = asString(payload?.reason, "listing_inactive");
  const actionUrl = asString(payload?.actionUrl);

  const reasonLine =
    reason === "order_created_elsewhere"
      ? "掛單已由其他買家成交，您的出價已失效。"
      : "掛單已下架或不再接受出價，您的 pending 出價已失效。";

  const bodyLines = [
    `您對「${cardName}」的出價已失效。`,
    ...(offerPriceLabel ? [`出價金額：${offerPriceLabel}`] : []),
    reasonLine,
    "如需購買請瀏覽其他掛單或重新出價。",
  ];

  return renderFromLayout(`出價已失效：${cardName}`, {
    title: `出價已失效：${cardName}`,
    preheader: `「${cardName}」出價已失效`,
    headline: "出價已失效",
    bodyLines,
    primaryAction: actionUrl
      ? { label: "前往交易", href: actionUrl }
      : undefined,
  }, payload);
}

function renderSimpleBrandedEmail(args: {
  subject: string;
  headline: string;
  preheader?: string;
  bodyLines: string[];
  actionLabel?: string;
  actionUrl?: string;
  payload?: Record<string, unknown>;
}): EmailTemplateRenderResult {
  return renderFromLayout(args.subject, {
    title: args.subject,
    preheader: args.preheader ?? args.headline,
    headline: args.headline,
    bodyLines: args.bodyLines,
    primaryAction:
      args.actionUrl && args.actionLabel
        ? { label: args.actionLabel, href: args.actionUrl }
        : undefined,
  }, args.payload);
}

function renderRefundApproved(payload?: Record<string, unknown>): EmailTemplateRenderResult {
  const amountLabel = asString(payload?.amountLabel);
  return renderSimpleBrandedEmail({
    subject: "售後退款已批准",
    headline: "退款處理中",
    bodyLines: [
      "您的售後退款申請已批准，平台正在處理退款。",
      ...(amountLabel ? [`預計退款：${amountLabel}`] : []),
      "款項將退回原付款方式。",
    ],
    actionLabel: "查看訂單",
    actionUrl: asString(payload?.actionUrl),
    payload,
  });
}

function renderRefundCompleted(payload?: Record<string, unknown>): EmailTemplateRenderResult {
  const amountLabel = asString(payload?.amountLabel, "HK$0");
  return renderSimpleBrandedEmail({
    subject: `退款成功：${amountLabel}`,
    headline: "退款成功",
    bodyLines: [
      `退款 ${amountLabel} 已成功處理。`,
      "實際入帳時間視銀行或付款方式而定。",
    ],
    actionLabel: "查看訂單",
    actionUrl: asString(payload?.actionUrl),
    payload,
  });
}

function renderMchApplicationSubmitted(payload?: Record<string, unknown>): EmailTemplateRenderResult {
  return renderSimpleBrandedEmail({
    subject: "商戶申請已提交",
    headline: "申請已收到",
    bodyLines: [
      "您的商戶 KYC 申請已提交，平台將盡快審核。",
      "審核結果將以電郵通知。",
    ],
    actionLabel: "查看申請",
    actionUrl: asString(payload?.actionUrl),
    payload,
  });
}

function renderMchKycApproved(payload?: Record<string, unknown>): EmailTemplateRenderResult {
  return renderSimpleBrandedEmail({
    subject: "KYC 審核已通過",
    headline: "商戶認證成功",
    bodyLines: [
      "您的商戶 KYC 已核准，可繼續完成 Stripe Connect 收款設定。",
    ],
    actionLabel: "前往商戶中心",
    actionUrl: asString(payload?.actionUrl),
    payload,
  });
}

function renderMchKycRejected(payload?: Record<string, unknown>): EmailTemplateRenderResult {
  const reason = asString(payload?.rejectReason);
  return renderSimpleBrandedEmail({
    subject: "KYC 審核未通過",
    headline: "申請未通過",
    bodyLines: [
      "您的商戶 KYC 申請未能通過審核。",
      ...(reason ? [`原因：${reason}`] : []),
      "請修正資料後可重新提交申請。",
    ],
    actionLabel: "查看申請",
    actionUrl: asString(payload?.actionUrl),
    payload,
  });
}

function renderMchConnectEnabled(payload?: Record<string, unknown>): EmailTemplateRenderResult {
  return renderSimpleBrandedEmail({
    subject: "Stripe Connect 已啟用",
    headline: "可開始收款",
    bodyLines: [
      "您的 Stripe Connect 帳戶已啟用，平台現在可以為您處理收款與撥款。",
    ],
    actionLabel: "查看財務中心",
    actionUrl: asString(payload?.actionUrl),
    payload,
  });
}

function renderAccSuspended(payload?: Record<string, unknown>): EmailTemplateRenderResult {
  const endsAt = asString(payload?.endsAt);
  return renderSimpleBrandedEmail({
    subject: "帳戶已暫停使用",
    headline: "帳戶暫停",
    bodyLines: [
      "您的 Cardvault HK 帳戶已被暫停使用。",
      ...(endsAt ? [`暫停至：${endsAt}`] : []),
      "如有疑問請聯絡客服。",
    ],
    actionUrl: asString(payload?.actionUrl),
    payload,
  });
}

function renderAccBanned(payload?: Record<string, unknown>): EmailTemplateRenderResult {
  return renderSimpleBrandedEmail({
    subject: "帳戶已永久封禁",
    headline: "帳戶封禁",
    bodyLines: [
      "您的 Cardvault HK 帳戶已被永久封禁。",
      "如有疑問請聯絡客服。",
    ],
    actionUrl: asString(payload?.actionUrl),
    payload,
  });
}

function renderAccSanctionApplied(
  payload?: Record<string, unknown>,
): EmailTemplateRenderResult {
  const label = asString(payload?.sanctionLabel, "帳戶限制");
  const endsAt = asString(payload?.endsAt);
  const reason = asString(payload?.reason);
  return renderSimpleBrandedEmail({
    subject: `帳戶限制：${label}`,
    headline: "帳戶限制通知",
    bodyLines: [
      `您的 Cardvault HK 帳戶已套用限制：${label}。`,
      ...(endsAt ? [`有效期至：${endsAt}`] : []),
      ...(reason ? [`原因：${reason}`] : []),
      "如有疑問請聯絡客服。",
    ],
    actionUrl: asString(payload?.actionUrl),
    payload,
  });
}

function renderAccSanctionLifted(
  payload?: Record<string, unknown>,
): EmailTemplateRenderResult {
  const label = asString(payload?.sanctionLabel, "帳戶限制");
  return renderSimpleBrandedEmail({
    subject: "帳戶限制已解除",
    headline: "限制已解除",
    bodyLines: [
      `先前套用的帳戶限制（${label}）已到期或解除。`,
      "您可登入查看帳戶狀態。",
    ],
    actionLabel: "前往平台",
    actionUrl: asString(payload?.actionUrl),
    payload,
  });
}

function renderModReportReceived(payload?: Record<string, unknown>): EmailTemplateRenderResult {
  const caseNumber = asString(payload?.caseNumber);
  return renderSimpleBrandedEmail({
    subject: "舉報已受理",
    headline: "我們已收到您的舉報",
    bodyLines: [
      "感謝您協助維護平台安全，我們已受理您的舉報。",
      ...(caseNumber ? [`案件編號：${caseNumber}`] : []),
      "結案後將另行通知結果。",
    ],
    actionLabel: "前往平台",
    actionUrl: asString(payload?.actionUrl),
    payload,
  });
}

function renderModReportUpheldSubject(payload?: Record<string, unknown>): EmailTemplateRenderResult {
  const caseNumber = asString(payload?.caseNumber);
  return renderSimpleBrandedEmail({
    subject: "舉報案件成立通知",
    headline: "相關案件已裁定成立",
    bodyLines: [
      "平台已完成審核，相關舉報案件裁定成立。",
      ...(caseNumber ? [`案件編號：${caseNumber}`] : []),
      "請登入查看帳戶或訂單狀態更新。",
    ],
    actionLabel: "前往平台",
    actionUrl: asString(payload?.actionUrl),
    payload,
  });
}

function renderModPayoutFrozen(payload?: Record<string, unknown>): EmailTemplateRenderResult {
  return renderSimpleBrandedEmail({
    subject: "出款已凍結",
    headline: "出款暫停",
    bodyLines: [
      "因平台審核或爭議處理，您的出款功能已暫時凍結。",
      "請登入查看詳情或聯絡客服。",
    ],
    actionLabel: "前往平台",
    actionUrl: asString(payload?.actionUrl),
    payload,
  });
}

function renderPayoutFailed(payload?: Record<string, unknown>): EmailTemplateRenderResult {
  const errorMessage = asString(payload?.errorMessage);
  return renderSimpleBrandedEmail({
    subject: "撥款失敗",
    headline: "Connect 撥款失敗",
    bodyLines: [
      "商戶訂單撥款未能完成，請檢查 Stripe Connect 設定或聯絡客服。",
      ...(errorMessage ? [`錯誤：${errorMessage}`] : []),
    ],
    actionLabel: "查看財務中心",
    actionUrl: asString(payload?.actionUrl),
    payload,
  });
}

function renderPayoutFpsCompleted(payload?: Record<string, unknown>): EmailTemplateRenderResult {
  const amountLabel = asString(payload?.amountLabel);
  return renderSimpleBrandedEmail({
    subject: "FPS 出款完成",
    headline: "款項已釋放",
    bodyLines: [
      "您的訂單款項已按平台規則處理釋放。",
      ...(amountLabel ? [`金額：${amountLabel}`] : []),
    ],
    payload,
  });
}

function renderPayoutRecoveryDue(payload?: Record<string, unknown>): EmailTemplateRenderResult {
  const amountLabel = asString(payload?.amountLabel);
  return renderSimpleBrandedEmail({
    subject: "追償款項待繳",
    headline: "請處理追償款項",
    bodyLines: [
      "鑑定失敗相關追償款項待繳，請登入商戶訂單查看詳情。",
      ...(amountLabel ? [`待繳金額：${amountLabel}`] : []),
    ],
    actionLabel: "查看訂單",
    actionUrl: asString(payload?.actionUrl),
    payload,
  });
}

function renderGradingStatusEmail(args: {
  subject: string;
  headline: string;
  bodyLines: string[];
  payload?: Record<string, unknown>;
}): EmailTemplateRenderResult {
  return renderSimpleBrandedEmail({
    subject: args.subject,
    headline: args.headline,
    bodyLines: args.bodyLines,
    actionLabel: "查看訂單",
    actionUrl: asString(args.payload?.actionUrl),
    payload: args.payload,
  });
}

export function renderEmailTemplate(
  input: EmailTemplateRenderInput,
): EmailTemplateRenderResult | null {
  switch (input.templateKey) {
    case "acc.password_changed":
      return renderAccPasswordChanged(input.payload);
    case "acc.email_verified":
      return renderSimpleBrandedEmail({
        subject: "電郵驗證成功",
        headline: "歡迎加入 Cardvault HK",
        bodyLines: [
          "您的電郵已成功驗證，帳戶現已啟用。",
          "您可以開始瀏覽市集、交易與管理收藏。",
        ],
        actionLabel: "前往平台",
        actionUrl: asString(input.payload?.actionUrl),
        payload: input.payload,
      });
    case "offer.received":
      return renderOfferReceived(input.payload);
    case "offer.accepted":
      return renderOfferAccepted(input.payload);
    case "offer.countered":
      return renderOfferCountered(input.payload);
    case "offer.rejected":
      return renderOfferRejected(input.payload);
    case "offer.buy_now":
      return renderBuyNowSeller(input.payload);
    case "order.payment_confirmed":
      return renderOrderPaymentConfirmed(input.payload);
    case "order.payment_expired":
      return renderOrderPaymentExpired(input.payload);
    case "order.shipped":
      return renderOrderShipped(input.payload);
    case "order.buyer_confirmed":
      return renderOrderBuyerConfirmed(input.payload);
    case "order.cancelled":
      return renderOrderCancelled(input.payload);
    case "order.review_invite":
      return renderSimpleBrandedEmail({
        subject: "邀請您評價交易對象",
        headline: "為這次交易評分",
        bodyLines: [
          `訂單「${asString(input.payload?.cardName, "商品")}」已完成。`,
          "歡迎為交易對象留下評價，協助社群建立信任。",
        ],
        actionLabel: "前往評價",
        actionUrl: asString(input.payload?.actionUrl),
        payload: input.payload,
      });
    case "p2p.meetup_arranged":
      return renderSimpleBrandedEmail({
        subject: "面交交易已約定",
        headline: "面交安排",
        bodyLines: [
          `訂單「${asString(input.payload?.cardName, "商品")}」已建立。`,
          "請與對方約定面交時間地點，當面點清錢貨後由買家確認完成。",
        ],
        actionLabel: "查看訂單",
        actionUrl: asString(input.payload?.actionUrl),
        payload: input.payload,
      });
    case "p2p.meetup_completed":
      return renderSimpleBrandedEmail({
        subject: "面交交易已完成",
        headline: "買家已確認完成",
        bodyLines: [
          `買家已確認訂單「${asString(input.payload?.cardName, "商品")}」面交完成。`,
        ],
        actionLabel: "查看訂單",
        actionUrl: asString(input.payload?.actionUrl),
        payload: input.payload,
      });
    case "mod.report_outcome":
      return renderModReportOutcome(input.payload);
    case "payout.completed":
      return renderPayoutCompleted(input.payload);
    case "payout.processing":
      return renderSimpleBrandedEmail({
        subject: "撥款處理中",
        headline: "撥款進行中",
        bodyLines: [
          "您的商戶訂單撥款正在處理中。",
          "完成後將另行通知，請登入財務中心查看狀態。",
        ],
        actionLabel: "查看財務中心",
        actionUrl: asString(input.payload?.actionUrl),
        payload: input.payload,
      });
    case "grading.c2c.ship_to_platform":
      return renderGradingC2cShipToPlatform(input.payload);
    case "grading.b2c.merchant_ship_in":
      return renderGradingB2cMerchantShipIn(input.payload);
    case "grading.b2c.awaiting_payment":
      return renderGradingStatusEmail({
        subject: "請完成付款",
        headline: "鑑定訂單待付款",
        bodyLines: [
          `您已建立商戶鑑定訂單「${asString(input.payload?.cardName, "商品")}」。`,
          "請盡快完成付款以啟動鑑定流程。",
        ],
        payload: input.payload,
      });
    case "grading.b2c.payout_completed":
      return renderGradingStatusEmail({
        subject: "鑑定訂單撥款完成",
        headline: "撥款已完成",
        bodyLines: [
          `「${asString(input.payload?.cardName, "商品")}」鑑定訂單撥款已完成。`,
          ...(asString(input.payload?.amountLabel)
            ? [`撥款金額：${asString(input.payload?.amountLabel)}`]
            : []),
        ],
        payload: input.payload,
      });
    case "grading.c2c.passed_shipped":
      return renderGradingPassedShipped(input.templateKey, input.payload);
    case "grading.b2c.passed_shipped":
      return renderGradingPassedShipped(input.templateKey, input.payload);
    case "grading.c2c.failed":
      return renderGradingFailed(input.templateKey, input.payload);
    case "grading.b2c.failed":
      return renderGradingFailed(input.templateKey, input.payload);
    case "grading.c2c.refund":
      return renderGradingC2cRefund(input.payload);
    case "offer.expired":
      return renderOfferExpired(input.payload);
    case "refund.approved":
      return renderRefundApproved(input.payload);
    case "refund.completed":
      return renderRefundCompleted(input.payload);
    case "refund.failed":
      return renderSimpleBrandedEmail({
        subject: "退款未能完成",
        headline: "退款失敗",
        bodyLines: [
          "您的退款請求未能成功處理。",
          ...(asString(input.payload?.errorMessage)
            ? [`原因：${asString(input.payload?.errorMessage)}`]
            : []),
          "請登入查看訂單詳情或聯絡客服。",
        ],
        actionLabel: "查看訂單",
        actionUrl: asString(input.payload?.actionUrl),
        payload: input.payload,
      });
    case "mch.application_submitted":
      return renderMchApplicationSubmitted(input.payload);
    case "mch.kyc_approved":
      return renderMchKycApproved(input.payload);
    case "mch.kyc_rejected":
      return renderMchKycRejected(input.payload);
    case "mch.connect_enabled":
      return renderMchConnectEnabled(input.payload);
    case "acc.suspended":
      return renderAccSuspended(input.payload);
    case "acc.banned":
      return renderAccBanned(input.payload);
    case "acc.sanction_applied":
      return renderAccSanctionApplied(input.payload);
    case "acc.sanction_lifted":
      return renderAccSanctionLifted(input.payload);
    case "mod.report_received":
      return renderModReportReceived(input.payload);
    case "mod.report_upheld_subject":
      return renderModReportUpheldSubject(input.payload);
    case "mod.payout_frozen":
      return renderModPayoutFrozen(input.payload);
    case "payout.failed":
      return renderPayoutFailed(input.payload);
    case "payout.fps_completed":
      return renderPayoutFpsCompleted(input.payload);
    case "payout.recovery_due":
      return renderPayoutRecoveryDue(input.payload);
    case "grading.c2c.inbound_shipped":
      return renderGradingStatusEmail({
        subject: "賣家已寄出至平台",
        headline: "入庫物流已更新",
        bodyLines: [
          `賣家已提交「${asString(input.payload?.cardName, "商品")}」入庫物流。`,
          ...(asString(input.payload?.trackingNo)
            ? [`物流單號：${asString(input.payload?.trackingNo)}`]
            : []),
        ],
        payload: input.payload,
      });
    case "grading.c2c.intake":
      return renderGradingStatusEmail({
        subject: "平台已收貨 — 鑑定中",
        headline: "平台已收貨",
        bodyLines: [
          `「${asString(input.payload?.cardName, "商品")}」已送達平台，鑑定進行中。`,
        ],
        payload: input.payload,
      });
    case "grading.b2c.inbound_shipped":
      return renderGradingStatusEmail({
        subject: "商戶已寄出至平台",
        headline: "入庫物流已更新",
        bodyLines: [
          `商戶已提交「${asString(input.payload?.cardName, "商品")}」入庫物流。`,
        ],
        payload: input.payload,
      });
    case "grading.b2c.authenticating":
      return renderGradingStatusEmail({
        subject: "鑑定進行中",
        headline: "平台鑑定中",
        bodyLines: [
          `「${asString(input.payload?.cardName, "商品")}」正在平台鑑定中。`,
        ],
        payload: input.payload,
      });
    case "grading.c2c.seller_return":
      return renderGradingStatusEmail({
        subject: "請取回卡牌",
        headline: "待賣家取回",
        bodyLines: [
          `鑑定失敗後，「${asString(input.payload?.cardName, "商品")}」待您取回。`,
          "請登入查看平台指示。",
        ],
        payload: input.payload,
      });
    case "grading.c2c.buyer_confirmed":
      return renderGradingStatusEmail({
        subject: "買家已確認收貨",
        headline: "買家已確認收貨",
        bodyLines: [
          `買家已確認收到「${asString(input.payload?.cardName, "商品")}」。`,
        ],
        payload: input.payload,
      });
    case "grading.b2c.buyer_confirmed":
      return renderGradingStatusEmail({
        subject: "買家已確認收貨",
        headline: "買家已確認收貨",
        bodyLines: [
          `買家已確認收到「${asString(input.payload?.cardName, "商品")}」。`,
        ],
        payload: input.payload,
      });
    case "grading.c2c.payout_released":
      return renderGradingStatusEmail({
        subject: "款項已釋放",
        headline: "款項已釋放",
        bodyLines: [
          `「${asString(input.payload?.cardName, "商品")}」相關款項已按規則釋放。`,
        ],
        payload: input.payload,
      });
    case "grading.b2c.fail_settlement":
      return renderGradingStatusEmail({
        subject: "鑑定失敗 — 結算更新",
        headline: "鑑定失敗結算",
        bodyLines: [
          `「${asString(input.payload?.cardName, "商品")}」鑑定失敗，追償或退款正在處理。`,
          "請登入商戶訂單查看詳情。",
        ],
        payload: input.payload,
      });
    case "order.completed":
      return renderGradingStatusEmail({
        subject: `訂單已完成：${asString(input.payload?.cardName, "商品")}`,
        headline: "訂單已完成",
        bodyLines: [
          `「${asString(input.payload?.cardName, "商品")}」訂單已完成。`,
        ],
        payload: input.payload,
      });
    case "b2c.payment_merchant_action":
      return renderGradingStatusEmail({
        subject: "請安排發貨",
        headline: "付款成功 — 請發貨",
        bodyLines: [
          `買家已付款，請為「${asString(input.payload?.cardName, "商品")}」安排發貨。`,
        ],
        payload: input.payload,
      });
    case "b2c.shipped":
      return renderGradingStatusEmail({
        subject: `商戶已發貨：${asString(input.payload?.cardName, "商品")}`,
        headline: "商戶已發貨",
        bodyLines: [
          `商戶已為「${asString(input.payload?.cardName, "商品")}」安排發貨。`,
        ],
        payload: input.payload,
      });
    case "b2c.completed":
      return renderGradingStatusEmail({
        subject: "訂單完成 — 撥款處理中",
        headline: "B2C 訂單完成",
        bodyLines: [
          `「${asString(input.payload?.cardName, "商品")}」訂單已完成，撥款將按規則處理。`,
        ],
        payload: input.payload,
      });
    case "order.confirm_reminder":
      return renderSimpleBrandedEmail({
        subject: "請確認收貨",
        headline: "提醒：請確認收貨",
        bodyLines: [
          `您有訂單「${asString(input.payload?.cardName, "商品")}」已發貨一段時間，請盡快確認收貨。`,
        ],
        actionLabel: "查看訂單",
        actionUrl: asString(input.payload?.actionUrl),
        payload: input.payload,
      });
    case "order.ship_reminder":
      return renderSimpleBrandedEmail({
        subject: "請安排發貨",
        headline: "提醒：待發貨",
        bodyLines: [
          `訂單「${asString(input.payload?.cardName, "商品")}」已付款，請盡快安排發貨或提交物流。`,
        ],
        actionLabel: "查看訂單",
        actionUrl: asString(input.payload?.actionUrl),
        payload: input.payload,
      });
    case "mch.connect_onboarding_reminder":
      return renderSimpleBrandedEmail({
        subject: "請完成 Stripe Connect 設定",
        headline: "Connect 入驻未完成",
        bodyLines: [
          "您的商戶 KYC 已通過，但 Stripe Connect 尚未完成。",
          "請登入完成入驻以接收撥款。",
        ],
        actionLabel: "前往財務中心",
        actionUrl: asString(input.payload?.actionUrl),
        payload: input.payload,
      });
    case "mch.connect_action_required":
      return renderSimpleBrandedEmail({
        subject: "Stripe Connect 需補充資料",
        headline: "請補充 Connect 資料",
        bodyLines: [
          "您的 Stripe Connect 帳戶需要補充資料或驗證，才能正常收款與撥款。",
          ...(asString(input.payload?.actionReason)
            ? [`詳情：${asString(input.payload?.actionReason)}`]
            : []),
          "請登入財務中心完成 Stripe 要求項目。",
        ],
        actionLabel: "前往財務中心",
        actionUrl: asString(input.payload?.actionUrl),
        payload: input.payload,
      });
    case "mod.evidence_request":
      return renderSimpleBrandedEmail({
        subject: "請補充案件證據",
        headline: "需補充證據",
        bodyLines: [
          ...(asString(input.payload?.caseNumber)
            ? [`案件編號：${asString(input.payload?.caseNumber)}`]
            : []),
          "平台需要您補充更多證據以繼續處理相關案件。",
          ...(asString(input.payload?.message)
            ? [`管理員備註：${asString(input.payload?.message)}`]
            : []),
        ],
        actionLabel: "前往平台",
        actionUrl: asString(input.payload?.actionUrl),
        payload: input.payload,
      });
    case "mod.payout_unfrozen":
      return renderSimpleBrandedEmail({
        subject: "爭議案件已結案",
        headline: "出款狀態更新",
        bodyLines: [
          "相關爭議案件已結案。",
          "如先前出款被凍結，請登入查看最新出款狀態。",
        ],
        actionLabel: "前往平台",
        actionUrl: asString(input.payload?.actionUrl),
        payload: input.payload,
      });
    case "rewards.grant":
      return renderSimpleBrandedEmail({
        subject: "積分兌換成功",
        headline: "兌換成功",
        bodyLines: [
          `您已成功兌換「${asString(input.payload?.itemName, "獎勵")}」。`,
          ...(asString(input.payload?.pointsLabel)
            ? [`扣除積分：${asString(input.payload?.pointsLabel)}`]
            : []),
        ],
        actionLabel: "查看獎勵",
        actionUrl: asString(input.payload?.actionUrl),
        payload: input.payload,
      });
    case "rewards.coupon_expiring":
      return renderSimpleBrandedEmail({
        subject: "優惠券即將過期",
        headline: "券即將過期",
        bodyLines: [
          "您有未使用的優惠券即將過期，請盡快使用。",
          ...(asString(input.payload?.expiryLabel)
            ? [`到期日：${asString(input.payload?.expiryLabel)}`]
            : []),
        ],
        actionLabel: "查看獎勵",
        actionUrl: asString(input.payload?.actionUrl),
        payload: input.payload,
      });
    default:
      return null;
  }
}
