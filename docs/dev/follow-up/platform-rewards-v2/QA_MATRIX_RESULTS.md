# 平台獎勵 v2 — 全矩陣 QA 結果

> 執行指令：
> - `bun run test:rewards:gate` — integration + 合併 E2E（推薦；同 CI `rewards-e2e` job）
> - `bun run test:e2e:rewards-gate` — 僅 E2E（phase2 + phase3 + **phase4** + matrix + checkout-coupon + order-detail + stripe-reconcile，單一 dev server）

## Stripe 對帳 / 出款（`platform-rewards-stripe-reconcile`）

| ID | 情境 | E2E |
|----|------|-----|
| R1 | PI `amount` = DB `buyer_total_amount`（免運券 direct） | ✅ |
| R2 | 有補貼出款：`merchant_payout > buyer_total` → transfer **無** `source_transaction` | ✅ |
| R3 | 無券出款：`merchant_payout <= buyer_total` → transfer **有** `source_transaction` | ✅ |
| B1+ | phase2 B1 在設 `STRIPE_SECRET_KEY` 時加 PI assert | ✅ |

**所需 env（reconcile 專用）：** `STRIPE_SECRET_KEY`、`E2E_SELLER_EMAIL` / `E2E_SELLER_PASSWORD`（須對應 `E2E_SELLER_ID` 與 listing 擁有者）、`bun run stripe:webhook:listen`。

## 券種 × 情境矩陣

| 券種 | 發放方式 | 情境 | E2E | 備註 |
|------|----------|------|-----|------|
| `discount_coupon` | `auto_grant` + `trade_count` 買家 | 後台發布 → RPC 自動發放 | ✅ matrix M-G1 | |
| `free_shipping` | `auto_grant` + `trade_count` 買家 | 後台發布 → RPC 自動發放 | ✅ matrix M-G2 | |
| `points` | `auto_grant` + `trade_count` 買家 | 後台發布 → `point_ledger` 入帳 | ✅ matrix M-G3 | |
| `discount_coupon` | `auto_grant` | 可解鎖 tab 進度（5 筆門檻） | ✅ matrix M-M1 | |
| `discount_coupon` | `flash_only` | 搶券 / 庫存 / 每日上限 | ✅ phase3 C3.x | |
| `discount_coupon` | `flash_only` | `starts_at` 前不可搶 | ✅ `I-F3` + `C3.9` | |
| `free_shipping` | `flash_only` | 不出現在可解鎖 tab | ✅ matrix M-M3 | |
| `free_shipping` | 手動入錢包 | merchant_direct + 順豐 checkout | ✅ phase2 B1 | 補貼金額隨 listing 運費 |
| `discount_coupon` | 手動入錢包 | 最低消費符合 / 不符合 | ✅ phase2 B2 | |
| `free_shipping` / `discount` | 手動入錢包 | 切換券 / 清除券 | ✅ phase2 B3.4–B3.5 | |
| `free_shipping` | 手動入錢包 | 面交不符合 | ✅ phase2 B3.3 | |
| `free_shipping` | 手動入錢包 | checkout 開啟鑑定開關：picker 仍顯示、選券清空 | ✅ phase2 B3.1 | Phase 2b；非隱藏 picker |
| `discount_coupon` | 手動入錢包 | merchant_auth checkout | ✅ phase2 B2b.1 | |
| `free_shipping` | 手動入錢包 | merchant_auth checkout | ✅ phase2 B2b.2 | |
| `discount_coupon` | 手動入錢包 | direct-only 券 + auth preview | ✅ `I-D4` | `requires_authentication: false` |
| 封存 `CHECK_IN_DAY7_BONUS` | — | 不可解鎖列表 | ✅ matrix M-M2 | |
| 簽到計劃 | — | Admin `?tab=check-in` 載入 + 儲存 | ✅ matrix M-A2 + Partner #10 | |
| 獎勵活動列表 | — | Admin campaigns 載入 | ✅ matrix M-A1 | |
| `discount_coupon` | 積分商城 catalog | Admin 新增積分商城商品 → 兌換 | ✅ phase4 `C4.1`/`C4.2` · `I-G3` | |
| `free_shipping` | 積分商城 catalog | 兌換後入錢包 | ✅ `I-G8` | |
| `discount_coupon` | catalog | 積分不足 / 庫存 0 / 併發 | ✅ `I-G4`–`I-G6` | |
| `discount_coupon` | catalog + `points` 類型 | Admin 分離 flow 無 catalog | ✅ Partner G1.3 2026-08-09 | |
| 積分商城 | member persona | 商戶不可見 / 不可兌換 | ✅ `I-G9` · Partner G2.5 2026-08-09 | |

## 仍建議人工點一輪（E2E 未覆蓋或僅部分覆蓋）

| 情境 | 原因 |
|------|------|
| `event_once`（完善資料 / 首次上架 / 註冊完成） | 需真實事件觸發鏈，matrix 以 `trade_count` 代表 auto_grant |
| 商戶角色 `trade_count` | 未單獨開 case |
| 付款取消 / 48h cron 釋放券 | phase2 B3.6 未自動化 |
| 鑑定失敗 void 還券 | ✅ `I-D3` / `I-P0-3` |
| T+7 Connect 出款補差 | ~~Part B4 可選~~ → **R2/R3 已自動化**（`test:e2e:rewards-gate` 內 stripe-reconcile） |
| Admin 搶券檔期暫停/恢復 UI | ✅ phase3 C3.8 |
| 簽到計劃儲存（7 日階梯 + completion bonus） | ~~僅 smoke 載入~~ → ✅ Partner #10 2026-07-29 |

## 執行紀錄

- 新增 `e2e/platform-rewards-stripe-reconcile.spec.ts`：PI 對帳 + 出款 `source_transaction` 規則
- `bun run test:e2e:rewards-gate`（或 `bun run test:rewards:gate`）請在具備 `E2E_ADMIN_*`、`E2E_BUYER_*`、`E2E_LISTING_ID`、Stripe 測試模式與 `SUPABASE_SERVICE_ROLE_KEY` 的環境執行
- Stripe reconcile（R1–R3）另需 `STRIPE_SECRET_KEY` 與 seller 帳號對齊 listing；未設時相關 spec 會 skip
- Partner 人手清單：[PARTNER_CHECKLIST.md](./PARTNER_CHECKLIST.md)
