# Partner Handoff — 鑑定 Single Capture E2E

> **Partner 人手清單：** [PARTNER_QA.md](../../PARTNER_QA.md) O1（pass 可選）、O2（fail 追償）  
> 本頁為鑑定操作細節；唔再作獨立 Partner 必做 checklist。

**Date:** 2026-08-08  
**Branch:** `aaron-backend-wired`（pull 最新後再測）  
**Scope:** Member C2C 鑑定單 · Stripe manual PI · **single full capture at pass** · Admin 鑑定工作台  
**Backend:** Aaron track  
**Frontend / QA:** Partner  
**退款政策:** [refund-policy §7](../../refund-policy.md#7-s1--鑑定失敗grading-fail) · [REFUND_ADMIN_PLAYBOOK.md](../admin-moderation/REFUND_ADMIN_PLAYBOOK.md)

---

## 一句話

新鑑定單使用 **single capture**：checkout **authorize 全額** → 入庫 **不扣款**（必要時 re-auth）→ 鑑定通過 **一次 capture 全額**。請用 **新開鑑定單** + **真 Stripe test mode** 跑通下面主流程；舊 multicapture 在途單仍走舊路徑。

---

## 你要驗咩

| 優先 | 流程 | 路由 |
|------|------|------|
| **P0** | 買家付款 → 賣家入庫物流 → Admin 入庫 → Admin 鑑定通過 | Member C2C + `/admin/grading` |
| P1 | 鑑定失敗 cancel PI（新單未 capture）+ **賣方追償** | Admin fail `fault_party=seller` → **待追償** → 寄回賣家 |
| P2 | 出庫物流 → 買家確認 → T+3 FPS | 見 [member-fps-payout e2e-checklist](../member-fps-payout/e2e-checklist.md) |
| P3 | Merchant B2C 鑑定單（同上 single capture） | `MerchantOrderDetailView` 入庫 + `/admin/grading` |

**唔使驗：** Playwright `member-auth-escrow.spec.ts` 只係 mock 付款，**唔代表** Stripe capture 已通。

**自動化：** `bun run test:integration:grading:pass-stripe-smoke`（G-BP-S1）覆蓋 member single-capture pass 真 PI；Partner H2 可專注 webhook UI + Merchant B2C。

---

## 環境 checklist（開測前）

```bash
git pull origin aaron-backend-wired
bun install
bunx supabase db push
bun run supabase:types
```

### `.env.local` 必須有

| 變數 | 用途 |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | App + auth |
| `SUPABASE_SERVICE_ROLE_KEY` | SQL 抽查（Dashboard 亦可） |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | 真 Payment Element |
| `STRIPE_SECRET_KEY` | PI / capture |
| `STRIPE_WEBHOOK_SECRET` | `authorized` 狀態同步 |
| `CRON_SECRET` | （可選）T+3 cron |

### 本機 webhook（擇一）

```bash
bun run dev
# 另一個 terminal：
bun run stripe:webhook:listen
```

無 webhook → 付款後 `payment_capture_status` 唔會變 `authorized` → Admin 入庫會報「尚未完成授權付款」。

### 測試帳號

| 角色 | 要求 |
|------|------|
| **Admin** | `profiles.role = 'admin'` |
| **Buyer** | 鑑定單付款 |
| **Seller** | 上架 `use_authentication = true`；入庫前可填 FPS（soft remind，唔 block） |

### 開單

1. Seller 上架鑑定 listing  
2. Buyer 出價（開鑑定）→ Seller accept → 產生 `member_orders`  
3. **記低 `order_id` / `order_number`**  
4. ⚠️ **必須係新單**——確認 `escrow_capture_model = 'single'`（migration `20260901140000` 之後 checkout）

---

## 主流程（Member C2C · P0）

| # | 誰 | 做咩 | 預期 |
|---|-----|------|------|
| 1 | Buyer | `/checkout/{orderId}` 用 Stripe test 卡 `4242…` 付款 | PI `requires_capture` 全額 authorize（例：$100 卡 → **$310**）；checkout 見四行 breakdown |
| 2 | — | Webhook `payment_intent.amount_capturable_updated` | DB `escrow_status=custody`，`payment_capture_status=authorized` |
| 3 | Seller | 訂單詳情填入庫物流（快遞 + 單號） | `inbound_tracking_no` 有值 |
| 4 | Admin | `/admin/grading` → **待入庫** → **確認入庫** | `platform_received_at` 有值；`payment_capture_status` **仍為 `authorized`**；Stripe **無** capture event |
| 5 | Admin | **鑑定中** → **鑑定通過** | `payment_capture_status=fully_captured`；Stripe **一次** capture **$310**（`final_capture: true`） |
| 6 | Admin | **待出庫** → 填出庫物流 | `outbound_tracking_no` 有值 |
| 7 | Buyer | 確認收貨 | `buyer_confirmed_at` 有值；（可選）T+3 → FPS payout（賣家應得含 **inbound**，例 $100 卡 → payout **$130**） |

### SQL 抽查

```sql
SELECT id, order_number, escrow_status, payment_capture_status,
       escrow_capture_model, stripe_payment_intent_id,
       inbound_tracking_no, outbound_tracking_no,
       platform_received_at, auth_result, seller_payout_status
FROM member_orders
WHERE id = '<order_id>';
```

### Stripe Dashboard

同一 PI（或入庫 re-auth 後新 PI）：

- 入庫後：`Amount capturable` = **$310**，`Amount captured` = **$0**
- Pass 後：`Amount captured` = **$310**

---

## Phase C — 賣方追償（P1）

| # | 誰 | 做咩 | 預期 |
|---|-----|------|------|
| 1 | Admin | **鑑定中** → fail，`fault_party = seller` | Single：PI canceled；`escrow_status=cancelled`；`seller_settlement_status=pending` |
| 2 | — | SQL 抽查 | `seller_receivables` row `pending`，`amount_hkd = buyer_total_amount` |
| 3 | Admin | **待追償** → 確認賣方已收款（FPS ref 選填） | `seller_settlement_status=cleared`；receivable `paid` |
| 4 | Admin | 提交寄回賣家物流 | `outbound_tracking_no` 有值 |
| 5 | Seller | 訂單詳情 | 待追償 banner 顯示金額 |

**Legacy smoke：** `escrow_capture_model IS NULL` → fail → Stripe partial refund + receivable（金額 = auth_fee + inbound）。

---

## Legacy multicapture 在途單

`escrow_capture_model IS NULL` 嘅舊單仍會：入庫 partial **$180** → pass partial **$130**。Partner **唔需要**再驗舊單，除非 regression。

---

## 常見錯誤

| 症狀 | 可能原因 |
|------|----------|
| 入庫：「尚未完成授權付款」 | Webhook 未收到 / `STRIPE_WEBHOOK_SECRET` 錯 |
| Pass：「可扣款餘額不足」 | 授權過期；重新入庫確認觸發 re-auth，或開新單 |
| 入庫後 status 仍 `authorized` | **預期行為**（single capture 新單） |

---

## 相關文件

- [auth-escrow-v2/backend.md](../auth-escrow-v2/backend.md)
- [admin-grading/backend.md](./backend.md)
- [member-fps-payout/e2e-checklist.md](../member-fps-payout/e2e-checklist.md)
