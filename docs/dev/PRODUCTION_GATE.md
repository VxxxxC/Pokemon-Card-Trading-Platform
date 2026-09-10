# Production Gate — Logic 簽收 SSOT

> **North star：** Production Gate **全綠** = P0/P1 商業 logic 可上 production；Partner **唔**重跑退款／券／capture 規則，只做人眼 UI/UX。  
> **長期取代：** [prelaunch-gate.md](./prelaunch-gate.md) 作為「點跑」參考；**覆蓋範圍以本文件為準**。  
> **政策維度：** [refund-policy.md](./refund-policy.md) 階段 S0–S4。

---

## 1. 簽收契約

### 全綠定義

| 條件 | 說明 |
|------|------|
| **0 failed** | 該 tier 內所有步驟 exit 0 |
| **0 未批准 skip** | Vitest/Playwright skip 只允許 [附錄 C](#附錄-c--approved-skips) 白名單；**Merge Full v2 允許白名單內 skip（含 Phase H merchant 無 fixture 時）** |
| **verify 綠** | `bun run verify:merchant-grading-e2e` 在 merge 前必須 pass |

> **注意：** 「0 未批准 skip」唔等於「整個 repo 零 skip」— 附錄 C 已列明嘅設計性 / env 性 skip 在 v2 簽收仍算通過。

### 全綠唔代表

- UI 靚、RWD、無障礙完美
- v2 功能（Auction、申訴 portal、Email/Push 全站）— 見 [PARTNER_QA.md](./PARTNER_QA.md) §不在範圍
- 所有理論邊界（Stripe outage、極端並發）
- P2P 面交 **全鏈** 自動化（舉報制裁有 integration；金流無）

### Out of scope（寫入 audit 為 `OutOfScope`）

Auction mock（≠ make offer）、申訴 portal、Listing 頁舉報、Moderation Phase F cron、全站 Email/Push。

---

## 2. Gate 分層

> **時間為本機參考**（integration 串行、遠端 Supabase）；E2E 用 `next start`。

### PR Fast（每次 push / PR，約 20–25 min）

```bash
bunx tsc --noEmit
bun run lint
bun run build:ci
bun run test:moderation:gate    # 已含 integration:moderation + integration:grading + unit/moderation；勿再單獨跑 grading
bun run test:integration:rewards
```

**前置：** `bun run test:prelaunch:check-env`（本地可選；CI 必須）。

### Merge Full v2（merge / pre-prod，約 **120–150 min**）

**一鍵：**

```bash
# Terminal B（I-H14 專用）：stripe listen → localhost
bun run stripe:webhook:listen

# Terminal A — infra/dev（PR-B/C 未完成時 C1/admin 可 SKIP）
bun run test:production:gate

# 正式簽收（PR-B/C 完成後；C1 + admin-grading + mutation 必跑）
bun run test:production:gate:signoff
```

| 模式 | 命令 | 用途 |
|------|------|------|
| **Infra / dev** | `test:production:gate` | 腳本與步驟驗證；缺 C1/admin 檔可 SKIP 仍 exit 0 |
| **Sign-off** | `test:production:gate:signoff` | 等同 `PRODUCTION_GATE_SIGNOFF=1`；缺 C1/admin 或 skip mutation → **FAIL** |

腳本：[`scripts/production-gate.sh`](../scripts/production-gate.sh)。等價於 PR Fast + 下列步驟；**唔重複跑 tsc**（由 `moderation-release-gate` 涵蓋）。

| 階段 | 步驟 | 備註 |
|------|------|------|
| 0 | `prelaunch-check-env --with-stripe-e2e` | Stripe **Test mode** 即可 |
| 1 | `lint` → `build:ci` → `moderation-release-gate` → `integration:rewards` → `integration:moderation:pbt` | `build:ci` = 空 Supabase prerender；**唔代替** E2E 用 `build`；C2 擴充經 `moderation-release-gate` 內 `test:integration:grading` 自動跑 |
| 2 | `verify:merchant-grading-e2e`、grading stripe smokes、fps、connect | Connect merchant block 依賴 verify 綠 |
| 3 | `bun run build && bun run start` | `PRODUCTION_GATE=1` + `PLAYWRIGHT_SKIP_WEBSERVER=1` |
| 3 | **C1** `test:integration:stripe:webhook-route`（PR-B） | **server 起咗之後**跑；HTTP POST 或 in-process handler |
| 3 | `seed:moderation-e2e`、rewards/moderation E2E | rewards 預設 `test:e2e:rewards-gate:production`（**唔含** matrix M-A1） |
| 3 | `test:e2e:moderation-stripe-smoke`（I-H14） | **必須** `stripe listen` 轉發；與 C1 無關 |
| 3 | `test:e2e:admin-grading`（PR-C） | `--project=setup --project=guest` |
| 3 | `test:moderation:mutation` | sign-off **唔准** `PRODUCTION_GATE_SKIP_MUTATION=1` |

**Rewards matrix（PG-CPN-08）：** 預設 exclude `platform-rewards-matrix.spec.ts`（Flaky）。要連 matrix 一齊跑：`PRODUCTION_GATE_INCLUDE_MATRIX=1 bun run test:production:gate`（v2.1 穩定化後納入 sign-off）。

**Webhook 分工：**

| 用途 | 需要 `stripe listen`？ |
|------|------------------------|
| **C1** `api/stripe/webhook` integration | 否 — 測試內自簽 POST |
| **I-H14** moderation-stripe-smoke E2E | 是 — 真 PI 事件要轉發到跑緊嘅 app |
| Production go-live | Live Dashboard endpoint（ops，唔入日常 gate） |

**E2E 硬性：** `PLAYWRIGHT_BASE_URL` 指向 **`bun run start`**；gate 腳本會起 server 並設 `PLAYWRIGHT_SKIP_WEBSERVER=1`，避免 Playwright 再起 `dev`。

### Merge Full v1（手動清單 — 已由 v2 腳本取代）

PR Fast 全部，再加：

```bash
bun run verify:merchant-grading-e2e
bun run test:integration:fps-payout
bun run test:integration:merchant-connect-payout
bun run test:integration:grading:stripe-smoke
bun run test:integration:grading:pass-stripe-smoke
# E2E：先 bun run build && bun run start（單一 instance）
REWARDS_GATE=1 bun run test:e2e:rewards-gate
MODERATION_GATE=1 bun run test:e2e:moderation-gate
bun run test:e2e:moderation-stripe-smoke                 # I-H14；要 STRIPE_WEBHOOK_SECRET + listen
bun run test:moderation:mutation
bun run seed:moderation-e2e
```

### ~~未來一鍵（Phase 2c）~~

已實作：`bun run test:production:gate` → `scripts/production-gate.sh`。

---

## 3. 與現有 gate 對照

| Scope | 命令 | Production Gate |
|-------|------|-----------------|
| Grading | `bash scripts/grading-release-gate.sh` | Merge：integration 在 moderation:gate 已跑；smoke 另跑 |
| Moderation fast | `test:moderation:gate` | PR Fast |
| Moderation full | `test:moderation:gate:full` | Merge：mutation + seed + Playwright |
| Rewards | `test:rewards:gate` | Merge：integration 在 PR；E2E 在 Merge |
| FPS | `test:fps-payout:gate` | Merge 用 `test:integration:fps-payout`（gate 多 lint/tsc，可合併） |
| Connect | `test:integration:merchant-connect-payout` | Merge |
| Auth escrow | `test:auth-escrow:gate` | 可選（B2b 已在 rewards E2E） |
| Prelaunch | `test:prelaunch:gate:1a` / `:1b` | **見附錄 D**；唔等同 Production Gate |

---

## 4. Partner 分工（Gate 全綠之後）

**Mode：** `automated` = gate 全綠即可；`partner_only` = 必須人手；`hybrid` = logic 自動化 + 人手 UI/肉眼。

| 項目 | Mode | 時間 | Gate / 自動化 | Partner 做咩 |
|------|------|------|---------------|--------------|
| **M1** Staging 煙霧 | hybrid | ~15 min | `build:ci`；未來 admin-grading E2E | 開 4 頁唔白屏、視覺 OK |
| **M2** 舉報主線 | hybrid | ~10 min | I-R*/I-M* integration；穩定後 moderation E2E | modal 文案、按鈕位置 |
| **M3** 退款 spot check | hybrid | ~30–45 min | G-BF*、I-H*、I-H14 | **肉眼**對數、預覽 UI |
| **M4** 條款 / checkout | hybrid | ~5 min | `platform-legal` integration | 連結可點、披露位置 |
| **M5** 首頁 P0 | partner_only | ~15 min | 唔喺 Production Gate | 版面、空狀態 copy |
| **M6** FPS + grading UI | hybrid | ~15 min | fps + G-BP-S1；缺 admin grading E2E | M6.2–6.4 操作流 + UI |
| **M7** Connect 出賬 UI | hybrid | ~10 min | Connect M1–M4 integration | payouts chip、重試按鈕 |

**首次 staging 簽收：** M1–M7 合計約 **1.5–2 h**（邏輯唔使重測，時間主要係 UI/肉眼）。  
**每次 deploy 後：** 至少 **M1（~15 min）**。

詳細步驟：[PARTNER_QA.md](./PARTNER_QA.md)。

---

## 附錄 A — Coverage audit 矩陣

**Status：** `Covered` | `Skipped` | `Flaky` | `Missing` | `OutOfScope` | `Partial`  
**Gate：** `pr` | `merge` | `—`（未納入 gate）  
**Partner：** `Y` = gate 全綠後仍建議 Partner 肉眼；`N` = 純自動化簽收

**欄位（對齊 plan）：** `PG-ID` · Domain（表頭階段）· Scenario · TestIDs · Layer · Gate · Status · Artifact · GapAction

### S0 — 未入庫 / 取消 authorize

| PG-ID | Scenario | TestIDs | Layer | Gate | Status | Artifact | GapAction |
|-------|----------|---------|-------|------|--------|----------|-----------|
| PG-S0-01 | Member 入庫前 seller cancel | G-CAN1 | integration | pr | Covered | `auth-grading-cancel.integration.test.ts` | — |
| PG-S0-02 | Cancel rejected in grading | G-CAN2 | integration | pr | Covered | 同上 | — |
| PG-S0-03 | Cancel rejected after intake | G-CAN3 | integration | pr | Covered | 同上 | — |
| PG-S0-04 | Merchant pre-intake cancel 對稱 | G-CAN*M | integration | merge | **Covered** | `auth-grading-merchant-cancel.integration.test.ts` | — |
| PG-S0-05 | Merchant direct pending 過期 | — | integration | — | Covered | S0-05-1/2/3 | coupon：I-P0-2 |
| PG-S0-06 | Coupon release on PI cancel | I-P0-1b | unit/mock | — | Partial | `coupon-webhook.integration.test.ts` | C1：HTTP route |

### S1 — 鑑定 fail / 入庫後

| PG-ID | Scenario | TestIDs | Layer | Gate | Status | Artifact | GapAction |
|-------|----------|---------|-------|------|--------|----------|-----------|
| PG-S1-01 | Member happy path | G-W2 | integration | pr | Covered | `auth-grading-happy-path.integration.test.ts` | — |
| PG-S1-02 | Merchant happy path | G-W2M | integration | pr | Covered* | `auth-grading-merchant-happy-path.integration.test.ts` | *env 齊時 |
| PG-S1-03 | Admin outbound workflow | G-W1 | integration | pr | Covered | `auth-grading-workflow.integration.test.ts` | — |
| PG-S1-04 | Fail buyer fault prepare/finalize | G-BF1, G-BF3 | integration | pr | Covered | `auth-grading-fail-single.integration.test.ts` | — |
| PG-S1-05 | Fail seller fault void + receivable | G-BF2, G-BF4 | integration | pr | Covered | 同上 | — |
| PG-S1-06 | Cancel race before finalize | G-BF5 | integration | pr | Covered | 同上 | — |
| PG-S1-07 | Merchant fail buyer/seller | G-BF1M–4M | integration | pr | Covered* | `auth-grading-merchant-fail.integration.test.ts` | — |
| PG-S1-08 | Merchant cancel race | G-BF5M | integration | merge | **Covered** | `auth-grading-merchant-fail.integration.test.ts` | — |
| PG-S1-09 | Carrier seller/platform liability | G-BF6–8, G-BF6M–8M | integration | pr | Covered | fail-carrier *.test.ts | — |
| PG-S1-10 | **Platform fault** grading fail | G-BF10/10M | integration | merge | **Covered** | `auth-grading-fail-platform.integration.test.ts` · merchant-fail | — |
| PG-S1-11 | **Inconclusive** grading fail | G-BF11/11M | integration | merge | **Covered** | 同上 | platform reason 必填 |
| PG-S1-12 | Fail + coupon restore/keep | G-C1/C2, G-C1M/C2M | integration | pr | Covered | fail-coupon *.test.ts | — |
| PG-S1-13 | Confirm needs fully_captured | G-CONF1, G-CONF1M | integration | pr | Covered | confirm-guard *.test.ts | — |
| PG-S1-14 | Legacy multicapture fail | G-LF1, G-LF2 | integration | merge | Covered | `auth-grading-fail-legacy.integration.test.ts` | G-LF2 要 Stripe |
| PG-S1-15 | Stripe smoke fail PI | G-BF-S1–3 | integration | merge | Covered | `auth-grading-fail-stripe-smoke.integration.test.ts` | — |
| PG-S1-16 | Stripe smoke pass capture | G-BP-S1 | integration | merge | Covered | `auth-grading-pass-stripe-smoke.integration.test.ts` | — |
| PG-S1-17 | Pass saga partial failure | — | unit | merge | **Covered** | `goods-capture-saga.test.ts` | C2 finalize fail case |
| PG-S1-18 | Admin grading **UI** smoke | — | e2e | merge | **Covered** | `e2e/admin-grading.spec.ts` | guest project smoke |
| PG-S1-19 | Capture policy unit | — | unit | pr | Covered | `stripe-capture-policy.test.ts` | — |
| PG-S1-20 | Fail void saga unit | — | unit | pr | Covered | `auth-grading-fail-void-saga.test.ts` | — |
| PG-S1-21 | Fail webhook helper unit | — | unit | — | Partial | `auth-grading-fail-webhook.test.ts` | 非 HTTP route |

### S2 — Pass 後、買家確認前

| PG-ID | Scenario | TestIDs | Layer | Gate | Status | Artifact | GapAction |
|-------|----------|---------|-------|------|--------|----------|-----------|
| PG-S2-01 | 一般售後不開放（政策） | — | — | — | OutOfScope | refund-policy §3 | Admin 個案人手 |
| PG-S2-02 | Outbound + 未 confirm 狀態 | G-W1, G-W2 | integration | pr | Partial | workflow + happy-path | 無專項 dispute |

### S3 — 售後窗口內（Phase H）

| PG-ID | Scenario | TestIDs | Layer | Gate | Status | Artifact | GapAction |
|-------|----------|---------|-------|------|--------|----------|-----------|
| PG-S3-01 | member_auth prepare/finalize | I-H3, I-H10 | integration | pr | Covered | `phase-h-refund.integration.test.ts` | — |
| PG-S3-02 | merchant_direct / merchant_auth prepare | I-H1, I-H2 | integration | merge | **Covered** | `phase-h-refund.integration.test.ts` | — |
| PG-S3-03 | merchant_auth finalize + ledger | I-H2M | integration | merge | **Covered** | 同上 | — |
| PG-S3-04 | Past window blocks | I-H4 | integration | merge | **Covered** | 同上 | — |
| PG-S3-05 | Carrier / inconclusive member | I-H15, I-H15b, I-H16 | integration | pr | Covered | 同上 | — |
| PG-S3-06 | Carrier / inconclusive merchant | I-H15M, I-H15bM, I-H16M | integration | merge | **Covered** | 同上 | — |
| PG-S3-07 | Payout hold excludes failed refund | I-H12 | integration | merge | **Covered** | 同上 | — |
| PG-S3-08 | Refund preview RPC | I-H17 | integration | pr | Covered | 同上 | — |
| PG-S3-09 | **真 Stripe** 售後全鏈 | I-H14 | e2e | merge | Covered | `moderation-stripe-refund-smoke.spec.ts` | — |
| PG-S3-10 | Async refund replay | — | integration | merge | **Covered** | I-H18 · C7-U1/U2 | C7 |
| PG-S3-11 | P2P 面交舉報無 order refund | PG-S3-11 | integration | merge | **Covered** | `p2p-dispute-no-refund.integration.test.ts` | — |

### S4 — 窗口外 / 已出款

| PG-ID | Scenario | TestIDs | Layer | Gate | Status | Artifact | GapAction |
|-------|----------|---------|-------|------|--------|----------|-----------|
| PG-S4-01 | Past window (eligibility) | I-H4 | integration | merge | Skipped | phase-h | env |
| PG-S4-02 | FPS pipeline post-confirm | 1A, 1B | integration | merge | Covered | `member-fps-pipeline.integration.test.ts` | — |
| PG-S4-03 | Connect held/retry/failed | M1–M4 | integration | merge | Covered* | `merchant-connect-payout-pipeline.integration.test.ts` | *部分 skip |

### Coupon / Checkout

| PG-ID | Scenario | TestIDs | Layer | Gate | Status | Artifact | GapAction |
|-------|----------|---------|-------|------|--------|----------|-----------|
| PG-CPN-01 | Coupon FSM / security / PBT | — | integration | pr | Covered | `coupon-fsm`, `coupon-security`, `coupon-pbt` | — |
| PG-CPN-02 | Member auth coupon prepare | I-F0–F6 | integration | pr | Covered | `member-auth-coupon.integration.test.ts` | — |
| PG-CPN-03 | Points catalog redeem | I-G1–G12 | integration | pr | Covered | `points-redemption-catalog.integration.test.ts` | — |
| PG-CPN-04 | E2E checkout coupon UX | E2E-C1–C4 | e2e | merge | Covered | `rewards-checkout-coupon.spec.ts` | — |
| PG-CPN-05 | Stripe reconcile amounts | R1–R3 | e2e | merge | Covered | `platform-rewards-stripe-reconcile.spec.ts` | — |
| PG-CPN-06 | B2b merchant_auth + coupon | B2b.* | e2e | merge | Covered | `platform-rewards-phase2.spec.ts` | — |
| PG-CPN-07 | Flash claim / sold out | C3.* | e2e | merge | Covered | `platform-rewards-phase3.spec.ts` | — |
| PG-CPN-08 | Rewards matrix bootstrap | M-A1+ | e2e | merge | **Partial** | `platform-rewards-matrix.spec.ts` | opt-in `PRODUCTION_GATE_INCLUDE_MATRIX=1` |
| PG-CPN-09 | Full checkout E2E（無券 baseline） | C8 | e2e | merge | **Covered** | `merchant-auth-baseline-checkout.spec.ts` | — |

### Report / Moderation（非金流）

| PG-ID | Scenario | TestIDs | Layer | Gate | Status | Artifact | GapAction |
|-------|----------|---------|-------|------|--------|----------|-----------|
| PG-RPT-01 | Chat/profile report + merge case | I-R1–R5 | integration | pr | Covered | `moderation-matrix.integration.test.ts` | — |
| PG-RPT-02 | Admin queue / bundle / chat audit | I-M1–M4 | integration | pr | Covered | 同上 | — |
| PG-RPT-03 | Sanctions / freeze / suspend | I-E1–E5 | integration | pr | Covered | 同上 | — |
| PG-RPT-04 | Outcome notification RPC | I-N1, I-N2 | integration | pr | Covered | 同上 | — |
| PG-RPT-05 | E2E admin disputes UI | E2E-G5, AB* | e2e | merge | **Covered** | `admin-moderation.spec.ts` | next start + chat room ASC 對齊 |
| PG-RPT-06 | E2E duplicate chat report | E2E-R6 | e2e | merge | **Covered** | `user-report.spec.ts` | UI 首報 + UI duplicate |
| PG-RPT-07 | E2E outcome modal | E2E-N1 | e2e | merge | Covered | `report-outcome-notification.spec.ts` | — |
| PG-RPT-08 | Mutation score moderation pure | — | mutation | merge | Covered | `test:moderation:mutation` | — |

### Webhook / Infra

| PG-ID | Scenario | TestIDs | Layer | Gate | Status | Artifact | GapAction |
|-------|----------|---------|-------|------|--------|----------|-----------|
| PG-WH-01 | Merchant PI handler mock | I-P0-1b | integration | — | Partial | `coupon-webhook.integration.test.ts` | — |
| PG-WH-02 | **HTTP** `api/stripe/webhook` route | C1 | integration | merge | **Covered** | `webhook-route.integration.test.ts` | 5 events + signature |
| PG-WH-03 | Staging webhook replay | — | ops | — | Missing | — | Dashboard / manual |

---

## 附錄 B — Gap backlog

| Pri | ID | 動作 | 產出 | v2 |
|-----|-----|------|------|-----|
| P0 | C1 | Webhook HTTP 全鏈（**先 2–3 條高風險 event**） | `tests/integration/stripe/webhook-route.integration.test.ts` | **Done** |
| P0 | C2 | Pass saga：Stripe OK、finalize fail | **擴充** [`tests/unit/payments/goods-capture-saga.test.ts`](../tests/unit/payments/goods-capture-saga.test.ts) finalize fail case | **Done** |
| P0 | C3 | Merchant pre-intake cancel | RPC + G-CAN*M | **Done** |
| P0 | NEW | Admin grading E2E smoke | `e2e/admin-grading.spec.ts` | **Done** |
| P0 | NEW | E2E harness | `production-gate.sh` + Playwright `PRODUCTION_GATE` | **Done** |
| P1 | C4 | G-BF5M merchant cancel race | grading integration | **Done** |
| P1 | C5 | Platform / inconclusive **grading** fail | integration + admin UI | **Done** |
| P1 | C6 | Legacy 非 seller fault `capture(0)` | **N/A**（零 legacy 在途） | — |
| P1 | NEW | Phase H merchant skips | CI `phaseHMerchantId` / listing fixture | **Done** |
| P1 | NEW | Stabilize matrix M-A1 E2E | `platform-rewards-matrix.spec.ts` | **Done**（soak 後預設 matrix） |
| P2 | C7 | Moderation refund async replay | saga retry test | **Done** |
| P2 | C8 | 無券 baseline checkout E2E | `merchant-auth-baseline-checkout.spec.ts` | **Done** |

（與 [prelaunch-1a-gap-checklist.md](./prelaunch-1a-gap-checklist.md) §C 對齊。）

---

## 附錄 C — Approved skips

**規則：** 下列 skip 只喺 **env 缺失** 或 **v2 已列原因** 時允許；**Merge Full v2 全綠 = 0 failed + 無未批准 skip**。

| Skip 條件 | 位置 | 所需 env / 原因 | v2 簽收 |
|-----------|------|-----------------|--------|
| `merchantIt` / `!hasMerchantGradingEnvVars()` | `grading-merchant-env.ts` | `E2E_SELLER_ID` = seller email user；`E2E_LISTING_ID` merchant auth listing | **唔允許** — `verify:merchant-grading-e2e` 必須綠 |
| `describe.skipIf(!hasMerchantGradingEnvVars())` | `merchant-connect-payout-pipeline.integration.test.ts` | Connect M1–M4 merchant block | **唔允許** — 同上 verify 綠後應跑 |
| `describe.skipIf(!hasFullModerationIntegrationEnv())` | moderation integration | Supabase + E2E 帳號全套 | **唔允許** — gate env 必須齊 |
| Grading stripe smoke 整檔 skip | stripe-smoke specs | `STRIPE_SECRET_KEY` | **唔允許** — Merge 必設 Test key |
| Playwright project skip（guest/buyer/seller） | 各 e2e spec | 按 testInfo.project | 設計性；唔計 failed |
| `STRIPE_SECRET_KEY` unset → smoke skip | `grading-release-gate.sh` | Stripe keys | **唔允許** |

**未在白名單嘅 skip：** 視為 **未批准**，須修 test 或補 env。

---

## 附錄 D — prelaunch 1a/1b ↔ Production Gate

**Production Gate 唔係 1a+1b 簡單子集**，而係重新編排：

| 步驟 | prelaunch 1a | prelaunch 1b | PR Fast | Merge Full |
|------|:------------:|:------------:|:-------:|:----------:|
| tsc | ✅ | — | ✅ | ✅ |
| lint | — | — | ✅ | ✅ |
| build:ci | ✅ | — | ✅ | ✅ |
| integration:grading | ✅ | — | ✅* | ✅* |
| integration:moderation | ✅** | — | ✅** | ✅** |
| unit/moderation | ✅** | — | ✅** | ✅** |
| grading stripe smokes | ✅ | — | — | ✅ |
| integration:fps-payout | ✅ | — | — | ✅ |
| integration:merchant-connect | ✅ | — | — | ✅ |
| moderation:mutation | ✅** | — | — | ✅ |
| seed:moderation-e2e | ✅** | — | — | ✅ |
| moderation Playwright | ✅** | — | — | ✅ (Flaky) |
| integration:rewards | — | ✅*** | ✅ | ✅ |
| moderation:pbt | — | — | — | ✅ |
| rewards E2E | — | ✅*** | — | ✅ |
| I-H14 E2E | — | ✅ | — | ✅ |
| verify:merchant-grading-e2e | 前置 | 前置 | — | ✅ |
| `test:production:gate` | — | — | — | ✅ |

\* 經 `test:moderation:gate`，**唔重複**單獨跑 `test:integration:grading`。  
\** 經 `test:moderation:gate:full`。  
\*** 經 `test:rewards:gate`（先 integration 再 E2E）。

---

## 相關文件

| 文件 | 用途 |
|------|------|
| [prelaunch-gate.md](./prelaunch-gate.md) | 本機跑法、1a/1b 命令 |
| [prelaunch-1a-gap-checklist.md](./prelaunch-1a-gap-checklist.md) | 跑完 1a 對 log；audit 已併入本文件附錄 A/B |
| [v2.1-deferred.md](./v2.1-deferred.md) | C3/C4/C5、Phase H seed、M-A1 等 v2.1 backlog |
| [PARTNER_QA.md](./PARTNER_QA.md) | Partner 人手；Gate 全綠後簽收 |
| [refund-policy.md](./refund-policy.md) | S0–S4 政策 SSOT |
| [capture-policy.md](./capture-policy.md) | Single vs legacy capture |
| [e2e.md](./e2e.md) | Playwright 帳號與 env |
| [test-coverage-ssot.md](./test-coverage-ssot.md) | Post v2.1 全站覆蓋進度（gate 以外） |

---

## 當前狀態（2026-08-15）

| 域 | 評估 |
|----|------|
| Grading logic (integration) | 強；C5 platform/inconclusive、C4 merchant cancel race → **v2.1** |
| Coupon / checkout | integration 強；**PG-CPN-08 M-A1 仍 Flaky**（production gate exclude matrix） |
| After-sales | member 強；Phase H merchant skip **v2 白名單允許** |
| Report | integration 強；E2E 穩定化已落地；R6 **Partial**（RPC duplicate leg） |
| Webhook | **C1 route Covered**（signed POST in-process）；I-H14 E2E 仍要 listen |
| Payout | FPS 綠；Connect 部分 skip（verify 綠後應跑） |
| **Merge Full v2 腳本** | `test:production:gate`（infra）/ `test:production:gate:signoff`（正式） |
| **Production Gate 全綠** | ✅ **2026-08-15** `test:production:gate:signoff`（r8，~44 min）— log：`/tmp/merge-full-v2-signoff-r8.log` |

**下一步：** Partner M1–M7；v2.1 消滅 C3/C4/C5、Phase H seed、M-A1。

---

## Production Stripe cutover（go-live ops，唔入 Merge Full）

| 步驟 | 說明 |
|------|------|
| Live 戶口 | KYC 完成後開通 |
| Live keys | 換 `STRIPE_SECRET_KEY` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` |
| Live webhook | Dashboard **Live mode** → `https://<prod>/api/stripe/webhook`；新 `STRIPE_WEBHOOK_SECRET` |
| 煙霧 | 小額真卡或 Stripe 建議 live smoke（一次性，唔納入日常 gate） |

日常 gate 繼續用 **Stripe Test mode / sandbox** 即可。
