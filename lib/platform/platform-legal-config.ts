export const PLATFORM_TERMS_CONFIG_KEY = "platform_terms";
export const PLATFORM_PRIVACY_CONFIG_KEY = "platform_privacy";

export const PLATFORM_LEGAL_BODY_MIN_LENGTH = 20;

export type PlatformLegalDocument = {
  title: string;
  body: string;
};

export const DEFAULT_PLATFORM_TERMS: PlatformLegalDocument = {
  title: "服務條款與退款政策摘要",
  body: `1. 訂單類型
- Member P2P 面交／線下交易：平台不提供退款，僅提供舉報與制裁機制。
- Member／Merchant 鑑定託管：經 Stripe 入款，適用下文退款規則。
- Merchant 非鑑定直購：經 Stripe 入款，適用售後窗口規則。

2. 鑑定託管流程
1. 買家完成託管付款。
2. 賣方將卡牌寄送至平台倉庫。
3. 平台安排第三方鑑定。
4. 鑑定通過後，平台代發予買家。

款項於鑑定通過前由平台託管，賣方不可提現。售後爭議一般發生於買家確認收貨之後（例如物流損毀、實物與描述不符），並非重新裁定鑑定 fail。

3. 鑑定費
- 平台確認收到卡牌後，鑑定服務視為已開始；鑑定費按平台當時公布費率計入訂單。
- 鑑定未通過且屬賣方責任（如假卡、嚴重不符）：買家可收回含鑑定費在內之全額（以訂單快照為準）。
- 鑑定已通過後之售後退款：鑑定費一般不予退還（平台責任且經審核之個案除外）。

4. 售後窗口
- Member 鑑定訂單：買家確認收貨後 3 個曆日內可申請售後。
- Merchant 訂單：買家確認收貨後 7 個曆日內可申請售後。
- 逾時、已出款或不符合資格之訂單，平台不提供自動退款。

5. 平台佣金與支付手續費
Merchant 交易佣金按平台當時公布費率於結算時扣除。若款項已經 Stripe 扣款後再退款，支付處理費可能無法由 Stripe 退回，將按責任方分攤（詳見裁定結果）。

6. 其他
使用本平台即表示您已閱讀並同意本條款及私隱政策（/privacy）。如有疑問請透過平台客服聯絡我們。`,
};

export const DEFAULT_PLATFORM_PRIVACY: PlatformLegalDocument = {
  title: "私隱政策",
  body: `1. 我們收集的資料
帳戶註冊資料（電郵、用戶名稱）、交易與訂單紀錄、KYC／身份驗證資料（如適用）、裝置與日誌資料，以及您主動提交的客服或舉報內容。

2. 資料用途
提供交易與託管服務、身份驗證、風控與爭議處理、改善產品體驗，以及履行法律義務。

3. 第三方服務
付款由 Stripe 處理；我們不儲存完整信用卡號。其他基礎設施供應商僅在提供服務所需範圍內處理資料。

4. 保留與安全
我們在達成收集目的所需期間內保留資料，並採取合理技術與組織措施保護個人資料。

5. 您的權利與聯絡
您可要求查閱、更正或刪除個人資料（受法律及合約限制）。聯絡方式請見平台公告或客服渠道。另請參閱服務條款（/terms）。`,
};

export function parsePlatformLegalDocument(
  value: unknown,
  fallback: PlatformLegalDocument,
): PlatformLegalDocument {
  if (!value || typeof value !== "object") {
    return fallback;
  }

  const record = value as Record<string, unknown>;
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const body = typeof record.body === "string" ? record.body.trim() : "";

  if (!title || body.length < PLATFORM_LEGAL_BODY_MIN_LENGTH) {
    return fallback;
  }

  return { title, body };
}

export function buildPlatformLegalDocumentValue(
  existing: unknown,
  patch: Partial<PlatformLegalDocument>,
  fallback: PlatformLegalDocument,
): PlatformLegalDocument {
  const current = parsePlatformLegalDocument(existing, fallback);
  const title =
    typeof patch.title === "string" && patch.title.trim()
      ? patch.title.trim()
      : current.title;
  const body =
    typeof patch.body === "string" && patch.body.trim()
      ? patch.body.trim()
      : current.body;

  return parsePlatformLegalDocument({ title, body }, fallback);
}

export function validatePlatformLegalBody(body: string): string | null {
  const trimmed = body.trim();
  if (trimmed.length < PLATFORM_LEGAL_BODY_MIN_LENGTH) {
    return `條款內容至少 ${PLATFORM_LEGAL_BODY_MIN_LENGTH} 個字元`;
  }
  return null;
}

export function formatPlatformLegalUpdatedAt(iso: string | null): string {
  if (!iso) {
    return "—";
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  const formatter = new Intl.DateTimeFormat("zh-Hant-HK", {
    year: "numeric",
    month: "long",
    timeZone: "Asia/Hong_Kong",
  });

  return formatter.format(date).replace(/\s/g, " ");
}
