# Prelaunch 1a + 交易缺口驗收清單

> **Coverage audit 與 gap backlog 已併入：** [PRODUCTION_GATE.md](./PRODUCTION_GATE.md) 附錄 A/B/C。本清單保留 **跑完 1a 對 log** 用法。

跑完 `test:prelaunch:gate:1a` 後，用本清單對 log 同 residual risk 逐項打勾。

## 快速命令

```bash
# Merge Full v2（推薦 — 見 PRODUCTION_GATE §2）
bun run test:production:gate

# 1a 背景 log
tail -f /tmp/prelaunch-1a.log

# 步驟摘要（PASS/FAIL/PENDING）
bun run summarize:prelaunch-1a-log

# 人手再跑缺口相關單測（可選）
bun run test:integration:grading
bun run test:integration:merchant-connect-payout
```

---

## A. Phase 1a 自動化步驟

| # | 步驟 | 1a 包含 | 打勾 | 備註 |
|---|------|---------|------|------|
| A0 | `verify:merchant-grading-e2e` | prelaunch-check-env | ☐ | env 對齊 |
| A1 | `tsc --noEmit` | ✅ | ☐ | |
| A2 | `test:integration:grading` | ✅ | ☐ | 睇 skip 數；env 對齊應少 skip |
| A3 | `grading:stripe-smoke` | ✅ | ☐ | 真 Stripe fail PI |
| A4 | `grading:pass-stripe-smoke` | ✅ | ☐ | 真 Stripe pass capture |
| A5 | `test:moderation:gate:full` | ✅ | ☐ | 含 mutation + Playwright（最慢） |
| A6 | `test:integration:fps-payout` | ✅ | ☐ | Member FPS |
| A7 | `test:integration:merchant-connect-payout` | ✅ | ☐ | M1–M4 + commission-rate |
| A8 | `build:ci` | ✅ | ☐ | CI 同款 prerender |

**1a 全綠標準：** log 尾 `=== Prelaunch gate Phase 1a: ALL PASSED ===`

---

## B. 交易流程 — 測試已覆蓋（1a / grading gate 驗證）

| # | 流程 | 測試 ID | 打勾 | 風險餘留 |
|---|------|---------|------|----------|
| B1 | Member 鑑定 happy path | G-W2 | ☐ | 低 |
| B2 | Merchant 鑑定 happy path | G-W2M | ☐ | env 對齊後應跑 |
| B3 | Member fail buyer/seller | G-BF1–5 | ☐ | 低 |
| B4 | Merchant fail buyer/seller | G-BF1M/3M/4M | ☐ | 低 |
| B5 | Fail + coupon restore/keep | G-C1/C2, G-C1M/C2M | ☐ | teardown race 已修 |
| B6 | Fail carrier liability | G-BF6–8, G-BF6M–8M | ☐ | 低 |
| B7 | Confirm 需 fully_captured | G-CONF1, G-CONF1M | ☐ | 低 |
| B8 | Member cancel guards | G-CAN1–3 | ☐ | 中（merchant 無對等） |
| B9 | Connect payout + recovery | M1–M4 | ☐ | carrier ledger 唔入抵扣（設計） |
| B10 | Moderation 售後退款 | I-H1–17, I-H15M–16M | ☐ | A5 full gate |
| B11 | Stripe smoke 真 PI | G-BF-S, G-BP-S | ☐ | A3/A4 |

---

## C. Residual risk — 1a **唔會**自動驗（需人手 / 下一輪）

| # | 缺口 | 嚴重度 | 打勾 | 建議跟進 |
|---|------|--------|------|----------|
| C1 | Webhook HTTP 全鏈 (`route.ts`) | P0 | ☑ | `webhook-route.integration.test.ts` |
| C2 | Pass saga：Stripe OK、finalize fail 卡住 | P0 | ☑ | `goods-capture-saga.test.ts` finalize fail |
| C3 | Merchant pre-intake cancel 無 RPC | P0 | ☐ | **v2.1 Deferred** — 產品 intent + G-CAN 對稱 |
| C4 | G-BF5M merchant cancel race | P1 | ☐ | **v2.1** |
| C5 | Platform/inconclusive **grading** fail | P1 | ☐ | **v2.1 Deferred** — refund-policy §12 |
| C6 | Legacy 非 seller fault `capture(0)` | P1 | N/A | 新鑑定單全 single；零 legacy 在途 |
| C7 | Moderation refund async replay | P2 | ☑ | I-H18 · C7-U1/U2 |
| C8 | 全鏈 checkout→authorize E2E（真 Stripe） | P2 | ☐ | Phase 1b rewards gate |

---

## D. Partner / 上線前（1a 外）

| # | 項目 | 打勾 |
|---|------|------|
| D1 | `docs/dev/PARTNER_QA.md` H1–H7 | ☐ |
| D2 | GitHub secrets 與本地 `sc01` env 一致 | ☐ |
| D3 | `bunx supabase db push` 至 `20260927120000` | ☐ |
| D4 | Phase 1b（webhook + `test:rewards:gate`） | ☐ |

---

## 跑完 1a 後 — 與 Agent 對 log 話術

複製貼上：

> 1a 跑完了，幫我 `bun run summarize:prelaunch-1a-log` 同 `docs/dev/prelaunch-1a-gap-checklist.md` 逐項打勾，失敗步驟查 root cause。

Agent 會：解析 `/tmp/prelaunch-1a.log` → 填 A 表 → 對 B 從 vitest 輸出確認 → C/D 標仍待辦。
