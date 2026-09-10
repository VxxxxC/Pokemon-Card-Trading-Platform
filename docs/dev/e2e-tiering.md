# E2E tiering — Gate / Nightly / Manual

> **目的：** 避免誤稱「repo 內每個 e2e spec 都已入 production gate」。  
> **SSOT 簽收：** [PRODUCTION_GATE.md](./PRODUCTION_GATE.md) · **Coverage + Solidity v2：** [test-coverage-ssot.md](./test-coverage-ssot.md) · Partner：[PARTNER_QA.md](./PARTNER_QA.md)

## Gate（`bun run test:production:gate:signoff`）

| 套件 | Spec 範例 |
|------|-----------|
| Rewards | `platform-rewards-phase2/3/4` · `rewards-checkout-coupon` · `member-auth-coupon-admin`（TC-E13）· `merchant-auth-baseline-checkout` ·（opt-in）`platform-rewards-matrix` |
| Moderation | `user-report` · `admin-moderation` · `report-outcome-notification` |
| Smoke | `home-p0-smoke` · `legal-pages-smoke` |
| Grading / Stripe | `admin-grading` · `moderation-stripe-refund-smoke` |

## Nightly / PR optional（v2.2+）

唔阻 v2.1 merge。CI：[`.github/workflows/nightly-test-coverage.yml`](../../.github/workflows/nightly-test-coverage.yml)（**03:00 HKT** 串行 `bun run test:nightly:coverage`）或 PR label。

| 觸發 | 跑咩 |
|------|------|
| `schedule` / `workflow_dispatch` | L2 platform vitest → L1 P2 E2E → L3 matrix E2E + integration（**串行**，防 staging fixture 衝突） |
| PR label `platform` | L2 only：`bun run test:integration:platform` |
| PR label `nightly-e2e` | L1 only：`bun run test:e2e:nightly:p2` |

| 優先 | Spec / 指令 | 說明 |
|------|-------------|------|
| P2 | `test:e2e:nightly:p2` · `member-trading-p2p` · `member-offer-negotiation` | C2C 主流程 |
| P2 | `global-chat-realtime.spec.ts` | Chat realtime |
| L3 | `test:e2e:nightly:matrix` · `test:integration:rewards-matrix` | Matrix soak（只計 nightly job；見 SSOT §9） |

**Rewards regression（無 matrix）：** [`.github/workflows/rewards.yml`](../../.github/workflows/rewards.yml) schedule **05:00 HKT** 跑 `test:e2e:rewards-gate:production`（含 **C2C Admin 券 TC-E13**）。Full gate（含 matrix）保留 `workflow_dispatch` / PR label `rewards`。

## Manual（Partner）

| 場景 | 頻率 |
|------|------|
| **M1** 四頁煙霧（disputes / grading / rewards / payouts） | **每次 staging deploy** |
| **M3.1** 一條退款肉眼 | **首次 prod cutover 前**（可選） |
| M2–M7 | v2.1 gate 覆蓋後 **日常 skip** |
