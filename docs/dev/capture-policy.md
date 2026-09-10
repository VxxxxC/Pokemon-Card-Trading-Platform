# Capture Policy — Single vs Legacy Multicapture (SSOT)

> **Status:** Active  
> **Updated:** 2026-08-12

## 文件層級

| 文件 | 角色 |
|------|------|
| **本文件** | **Capture 模型 SSOT** — `escrow_capture_model = 'single'` vs legacy `NULL` |
| [escrow-payment-policy.md](./escrow-payment-policy.md) | 託管框架、出款時序（T+3 FPS / T+7 Connect）、爭議窗口 |
| [refund-policy.md](./refund-policy.md) | 退款 breakdown；**衝突時 refund-policy 優先** |

Partner 鑑定 E2E 操作細節：[admin-grading PARTNER_HANDOFF.md](./follow-up/admin-grading/PARTNER_HANDOFF.md)  
Auth Escrow v2 Partner QA：[auth-escrow-v2/PARTNER_QA.md](./follow-up/auth-escrow-v2/PARTNER_QA.md)

---

## 一句話

**新鑑定單**（migration `20260901140000` 之後 checkout）使用 **single capture**：authorize 全額 → 入庫不扣款 → 鑑定通過一次 capture 全額。  
**Legacy 在途單**（`escrow_capture_model IS NULL`）仍走 staged multicapture。

---

## 對照表

| 維度 | 新單 `escrow_capture_model = 'single'` | Legacy `escrow_capture_model IS NULL` |
|------|----------------------------------------|---------------------------------------|
| PaymentIntent | `capture_method: manual`，authorize 全額 | `manual` + `request_multicapture: if_available` |
| Admin 入庫 | **不 capture**（必要時 re-auth） | partial capture 鑑定費（auth_fee） |
| Admin 鑑定通過 | **一次 full capture** = `buyer_total_amount` | staged goods capture → `fully_captured` |
| 鑑定失敗 | 新單多為 void / 未 capture；追償見 refund-policy §7 | legacy partial capture 路徑 |
| 退款 | [refund-policy.md §7.2](./refund-policy.md) | [refund-policy.md §7.1](./refund-policy.md) |
| Member FPS 後段 | T+3 hold → cron `payout_requests` → admin FPS 銷帳 | **相同**（capture 模型不影響 FPS 出款） |
| Merchant Connect 後段 | T+7 cron | **相同** |

---

## 如何辨識新單

```sql
SELECT id, order_number, escrow_capture_model, payment_capture_status
FROM member_orders
WHERE id = '<order_id>';
```

- 新單：`escrow_capture_model = 'single'`
- Legacy：`escrow_capture_model IS NULL`（除非刻意 regression）

⚠️ Partner / E2E 請用 **新開鑑定單**；舊 PI 無 multicapture 的 legacy 單不應作新功能驗收基準。

---

## 自動化 Gate

| 範圍 | 命令 |
|------|------|
| 鑑定 fail + pass（真 PI） | `bun run test:integration:grading:stripe-smoke` · `test:integration:grading:pass-stripe-smoke` |
| Member FPS 1A→1B→admin | `bun run test:integration:fps-payout` |
| FPS 獨立 full gate | `bun run test:fps-payout:gate` |
| Prelaunch 1a | 含 `test:integration:fps-payout`（見 [prelaunch-gate.md](./prelaunch-gate.md)） |

---

## 相關 migrations

| Migration | 內容 |
|-----------|------|
| `20260901140000` | Single-capture auth escrow |
| `20260802120000` | Member FPS pipeline（1A confirm + 1B cron） |
| `20260923120000` | Admin FPS 銷帳 RPC + order sync |
