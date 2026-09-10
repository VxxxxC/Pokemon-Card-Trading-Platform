# Merchant KYC Flow — Frontend Handoff

## Status

- **Backend:** ✅ Ready
- **Frontend:** 🟡 申請 wizard + admin 表格 UI 已接駁；Stripe CTA + Finance 真實摘要已接

## 申請表 Wizard（`MerchantApplyClient.tsx`）

（結構與行為不變 — 見先前 spec）

## Admin 審核頁（`AdminMerchantsClient.tsx`）

已還原至原先 admin 表格設計（參考 git `d9ba641`）：

- 頁首 card：「商戶與 KYC 審查」
- 搜尋：公司名 / Handle / 電郵 / BR / Stripe ID
- Filter chips：全部 / 待審核 / 已批准 / 已拒絕（含 count）
- shadcn `Table` + 狀態 badge + client 分頁
- **待審核**：Popover 查看 4 份文件、批准、拒絕（必填原因）
- **已批准** 無 `stripeAccountId`：「重試 Stripe 開通」（`retryKycProvisioning`）
- 反饋：`toast`（sonner）

### Admin hooks

- `listKycApplications()` — SSR `page.tsx`
- `getKycDocumentSignedUrl(documentId)`
- `reviewKycApplication(id, decision, reason?)`
- `retryKycProvisioning(applicationId)`

## 其他 UI

| File | 現況 |
|------|------|
| `MerchantOverviewClient.tsx` | `stripeConnected` 時「管理 Stripe 收款」→ `/api/stripe/connect/dashboard`；未完成時 onboard CTA |
| `finance/page.tsx` + `MerchantFinancePageData.tsx` | Server 載入 `kyc_records` + `getMerchantFinanceSummary()`；`MerchantFinanceClient` 顯示本月撥款、近期記錄（含 Transfer / Payment Intent、佣金 breakdown、failed 撥款錯誤、訂單詳情連結） |

### Stripe Connect 入口（merchant）

- **未完成 onboarding / payout 未就緒**：`/api/stripe/connect/onboard`（hosted onboarding）
- **已連結且 payout-ready**：`/api/stripe/connect/dashboard`（平台 `createLoginLink`，唔暴露 platform-admin `getStripeConnectDashboardUrl`）

## Acceptance checklist

- [x] 3 步 wizard + stepper
- [x] `/admin/merchants` 表格 UI + 審批/文件/重試
- [x] Merchant overview + finance Stripe CTA（onboard / dashboard login link）
- [x] Finance 頁以 `merchant_orders` 撥款記錄取代 mock 流水
- [x] Finance 撥款 list：中文撥款狀態、`stripe_transfer_id` / `stripe_payment_intent_id`（truncated + 複製）、平台費 breakdown、failed 顯示 `payout_error`、連結 `/profile/merchant/orderDetail/[id]`
