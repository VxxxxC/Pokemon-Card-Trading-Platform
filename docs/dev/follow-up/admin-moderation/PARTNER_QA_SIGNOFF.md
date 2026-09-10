# Partner QA Sign-off — 舉報與仲裁（Dev / Automation）

> **Partner 人手清單（唯一 SSOT）：** [PARTNER_QA.md](../../PARTNER_QA.md) — M2、M3  
> **Status:** ⬜ 待 Partner 簽收（見 PARTNER_QA.md）  
> **Feature:** Phase A–E+ · Phase G · G+（reporter outcome）  
> **環境：** staging only · 勿用 production 真實用戶

---

## 原則

| 層 | 負責 | 工具 |
|----|------|------|
| **Logic / regression** | Dev / CI | Stable moderation gate（見下） |
| **可寫 test 但未寫** | Dev backlog | [§Automation backlog](#automation-backlog) — **唔入** Partner 清單 |
| **Partner 人手** | Staging 部署驗證 + UX | **[PARTNER_QA.md](../../PARTNER_QA.md)** M2（必做）、R1（可選） |

**Logic 已由自動化覆蓋；Partner 唔重跑業務規則。**

---

## Dev release 前提（dev 簽，partner 信）

- [ ] Target branch 上 **stable gate 全綠**（見 [§Stable gate](#stable-gate-dev--ci)）
- [ ] Staging Supabase 已 push migrations `20260806120000`–`20260915120000`（含 Phase H refund saga + PR2 grading fail + PR3A–PR3C carrier/preview）

> Partner 簽收見 [PARTNER_QA.md](../../PARTNER_QA.md) M2 + M3。售後退款 Stripe 已由 1b I-H14 覆蓋。v2 見 [v2-plan.md](./v2-plan.md)。

### Stable gate（dev / CI）

```bash
bun run test:moderation:gate:full
# 或逐步（除錯用）：
bun run test:integration:moderation:pbt
bun run test:moderation:mutation
MODERATION_GATE=1 bun run test:e2e e2e/user-report.spec.ts e2e/report-outcome-notification.spec.ts --project=setup --project=guest --project=buyer
bun run seed:moderation-e2e
MODERATION_GATE=1 bun run test:e2e e2e/admin-moderation.spec.ts --project=setup --project=guest --project=buyer --project=seller
bun run build:ci
```

**Pre-H1/H2 完整順序：** [prelaunch-gate.md](../../prelaunch-gate.md) · `bun run test:prelaunch:gate:1a` + `test:prelaunch:gate:1b`

詳情：[6phase-test-plan.md](./6phase-test-plan.md) · [e2e.md](../../e2e.md)

---

## Partner 簽收

人手步驟已移至 **[PARTNER_QA.md](../../PARTNER_QA.md)**（M2 舉報、M3 退款 spot check）。請勿使用本頁舊 P1/P2 清單。

---

## 自動化已覆蓋（唔使人手）

> Partner 清單唔再列以下項；回歸靠 gate。

| 領域 | Integration | E2E |
|------|-------------|-----|
| 舉報提交、dedup、offline_trade 擋、證據、case 合併 | I-R1–R6 | `user-report.spec.ts` |
| Admin queue / bundle / chat audit / 調分 / dismiss / suspend(DB) | I-M* · I-L1a/b · I-M4 | `admin-moderation.spec.ts` |
| Subject history | I-G1–G4 | E2E-G5 |
| Outcome notify、resolution 文案、legacy、ack、IDOR | I-N* · I-G3 | E2E-N1 |
| 權限（非 admin、member redirect、suspended） | I-M5 | admin access + E2E-AB5a/b |
| 制裁副作用（listing / payout / chat / evidence override） | I-E1–I-E5 | — |
| Proxy 解封、永久封禁、訂單 panel 細節 | I-E5 | E2E-AB6 · E2E-AB7 · E2E-AB8 |
| 重複 resolve | I-L3 | — |
| 純函數 / resolution mapping | unit · PBT · mutation ≥85% | — |

完整 test ID 對照：[6phase-test-plan.md §5](./6phase-test-plan.md)

---

## Automation backlog

> ✅ AB-1～AB-9 已實作（2026-08-10）。保留作 test ID 對照。

| # | 行為 | Test ID | 狀態 |
|---|------|---------|------|
| AB-1 | upheld + 限制 Member 上架 → listings inactive | I-E1 | ✅ |
| AB-2 | upheld + 凍結出款 → `payout_status` frozen | I-E2 | ✅ |
| AB-3 | 制裁後禁發 chat | I-E3 | ✅ |
| AB-4 | 證據不足 + 管理員強制裁定 upheld | I-E4 | ✅ |
| AB-5 | suspend → `/marketplace` redirect；admin 豁免 | E2E-AB5a/b | ✅ |
| AB-6 | suspend 過期 → proxy 解封 | I-E5 · E2E-AB6 | ✅ |
| AB-7 | 永久封禁 → 登入失敗 | E2E-AB7 | ✅ |
| AB-8 | 關聯訂單卡連結 / timeline | E2E-AB8 | ✅ |
| AB-9 | I-N6 IDOR — CI 常駐 seller creds | `hasFullModerationIntegrationEnv` + workflow | ✅ |

---

## 參考（歷史人手步驟，非 Partner 必做）

詳細 UI／SQL 步驟仍留作 dev 除錯：

- [backend.md §Partner manual QA](./backend.md#partner-manual-qaphase-e--e)（E1–E7、E+1–E+9）
- [frontend.md §Partner manual QA](./frontend.md#partner-manual-qaphase-e--e)（F1–F15）
- [subject-history-plan.md §9](./subject-history-plan.md#9-verify-manual)

---

## 參考

- [6phase-test-plan.md](./6phase-test-plan.md) · [backend.md](./backend.md) · [frontend.md](./frontend.md) · [v2-plan.md](./v2-plan.md) · [e2e.md](../../e2e.md) · [PARTNER_QA.md](../../PARTNER_QA.md)
