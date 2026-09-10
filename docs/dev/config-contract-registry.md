# Config Contract Registry — Admin ↔ Runtime SSOT

> **目的：** 防止 **「order_kinds 類」parity gap** 喺任何域重演 — RPC/FSM 讀到嘅配置，Partner 必須能透過產品 UI（或標為 system-only）設定，且有 **Contract Test** 守衛。  
> **追蹤進度：** [test-coverage-ssot.md](./test-coverage-ssot.md) · **Staging 認證：** [staging-certification.md](./staging-certification.md) · **流程：** [test-solidity-plan.md](./test-solidity-plan.md)

---

## 1. 問題類型（Config Contract Parity Gap）

| 層 | 典型失敗 |
|----|----------|
| **Runtime** | RPC 讀 `restrictions.order_kinds`、`platform_settings`、escrow 規則 |
| **Admin** | 欄位缺失、default 錯、save 時 drop 欄位 |
| **Integration** | `buildXxxInput()` 注入 runtime 有但 UI 冇嘅值 → **假綠** |
| **E2E** | 只測 checkout，唔測 Admin publish 路徑 |

**守衛三件套（每個 P0 配置鍵）：**

| 代號 | 做咩 | 何時必須 |
|------|------|----------|
| **CC-UNIT** | `buildDefaultForm()` / type-change → payload 與 RPC default 一致 | 每個 PR 改 form |
| **CC-INT** | `upsertAdminRewardActivity(defaultForm)` **無 fixture override** → assert DB | 每個新 `restrictions.*` / settings key |
| **CC-E2E** | Admin UI click → 用戶路徑驗證（唔注入隱藏欄位） | P0 journey、Partner 會配置嘅域 |

Fixture builder **只可**標 `// @rpc-edge-only` 用於 RPC 邊界／negative，**不可**作為 Admin 行為嘅唯一證明。

---

## 2. 域總覽（macro）

| 域 | P0 配置來源 | Parity 風險 | CC-UNIT | CC-INT | CC-E2E | 備註 |
|----|-------------|-------------|---------|--------|--------|------|
| **Rewards 券** | `reward_templates.restrictions` · `reward_value` | **高**（checkout eligibility） | ☑ `template-form-catalog` | ☑ `admin-publish-defaults` | ☑ J-CPN-01–05 · TC-E13 | `order_kinds` ☑；`min_spend` CC-INT ☑ |
| **Rewards 觸發** | `trigger_conditions` | 中 | ◐ | ◐ matrix | ☑ phase2/3 | fixture 多 |
| **Points 商城** | `redemption_catalog` + template | 中 | ◐ | ◐ | ◐ phase4 | |
| **Platform 鑑定費** | `platform_settings` auth escrow | 高 | ◐ | ☑ `auth-fee`（**直寫 DB**） | ☐ Admin settings E2E | **CC-PLAT-01** |
| **Platform 佣金** | `platform_financial_config` | 高 | ◐ | ☑ `commission-rate`（**直寫 DB**） | ☐ | **CC-PLAT-02** |
| **Platform 法律** | `platform_settings` legal SSOT | 中 | ☑ legal unit | ☑ `platform-legal` | ☐ | |
| **Moderation 退款** | RPC eligibility + admin 操作 | 高 | — | ☑ matrix | ☑ J-MOD-01 | fixture 用於 matrix |
| **Grading FSM** | order flags + admin grading | 高 | — | ☑ gate integration | ◐ stripe smoke | 缺 Admin 入庫 E2E |
| **Merchant/KYC** | Connect · KYC docs | 中 | — | ☐ | ☐ TC-M10–11 | |
| **Cron/HTTP** | route auth + RPC | 中 | — | ☐ TC-M01+ | — | RPC 有、HTTP 無 |

**圖例：** ☑ 有 · ◐ 部分 · ☐ 缺 · — 不適用

---

## 3. Rewards — `reward_templates` 合約明細

### 3.1 `restrictions`（checkout eligibility）

| Key | RPC 消費者 | Admin UI | Default（form） | CC-UNIT | CC-INT | CC-E2E | Fixture 風險 |
|-----|------------|----------|-----------------|---------|--------|--------|--------------|
| `order_kinds` | `fn_compute_platform_subsidy` | `#reward-order-kinds` | free_ship: `["merchant","member"]`; discount: `["merchant"]` | ☑ | ☑ `admin-publish-defaults` | ☑ TC-E13 · C2C-ADM-1b | `buildMemberAuthFreeShippingInput` |
| `requires_authentication` | 同上 | 適用鑑定 | `any` | ◐ | ☑ 同上 | ☑ phase2 auth toggle | 少數 fixture override |
| `shipping_methods` | 同上 | *未獨立欄位*（default `sf`） | `["sf"]` | ◐ | ☑ 同上 | ☑ B3.3 meetup | meetup 靠 default |
| `min_item_subtotal_hkd` | 同上 | *未獨立欄位* | `0` | — | ☑ 同上 | ◐ | |

### 3.2 `reward_value`

| Key | Admin UI | CC-INT | CC-E2E |
|-----|----------|--------|--------|
| `max_subsidy_hkd` | 免運表單 | ☑ free_shipping publish | ☑ phase2 |
| `min_spend_hkd` | `#reward-min-spend` | ☑ J-CPN-07 (discount=100) | ☑ explicit in specs |
| `amount_hkd` | 折扣 | ☑ | ☑ |

### 3.3 Fixture allowlist（Rewards）

| Builder | Override | 用途 | 可否證明 Admin |
|---------|----------|------|----------------|
| `buildDefaultActivityForm` + `restrictionsForTypeChange` | 無（**contract SSOT**） | CC-INT | ✅ |
| `buildMemberAuthFreeShippingInput` | `order_kinds` + member | C2C RPC edge | ❌ only |
| `buildAuthFreeShippingInput` | 無 member in kinds | B2C auth | ❌ only |
| `buildAutoGrantDiscountInput` | default merchant | 通用 | ◐ partial |

---

## 4. Platform settings

| Key | RPC | Admin UI | CC-UNIT | CC-INT | CC-E2E | Gap |
|-----|-----|----------|---------|--------|--------|-----|
| `auth_escrow_config.auth_fee_hkd` | `fn_platform_auth_fee_hkd` | `/admin/settings` → `#appraisal-fee` | ☑ `auth-escrow-config.test.ts` | ☑ `auth-fee`（**直寫 DB**） | ☐ | **CC-PLAT-01** |
| `auth_escrow_config.sf_leg_fee_hkd` | `fn_platform_auth_sf_leg_fee` | **無獨立欄位**（merge on save） | ◐ merge unit | ◐ `auth-fee` upsert | ☐ | **CC-PLAT-01** |
| `platform_financial_config.commissionRate` | payout snapshot | `/admin/settings` → `#commission-rate` | ◐ parsers | ☑ `commission-rate`（**直寫 DB**） | ☐ | **CC-PLAT-02** |
| Legal terms/privacy | SSR / legal pages | `/admin/settings` | ☑ legal unit | ☑ `platform-legal` | ☐ smoke | |

**Backlog：**

| ID | 驗收 |
|----|------|
| **CC-PLAT-01** | Admin save 鑑定費 → member/merchant checkout 金額一致 |
| **CC-PLAT-02** | Admin save 佣金 → buyer-confirm payout snapshot 一致 |

---

## 5. P0 風險登記（macro audit · 2026-08-16）

> 類似 `order_kinds`：Runtime 有鍵、Integration fixture 可 bypass、Partner 用 Admin 設定。

| # | Runtime key | Admin | 風險 | CC 狀態 | Backlog |
|---|-------------|-------|------|---------|---------|
| 1 | `restrictions.order_kinds` | ☑ `#reward-order-kinds` | C2C checkout 灰 | ☑ 三件套 | — |
| 2 | `reward_value.min_spend_hkd` | ☑ `#reward-min-spend` | E2E 曾 default 填 0 | ☑ CC-INT · CC-UNIT | **CC-RWD-02**（E2E default path） |
| 3 | `restrictions.requires_authentication` | ☑ 適用鑑定 | fixture `false` bypass | ◐ INT 缺 default | CC-RWD-03 |
| 4 | `restrictions.shipping_methods` | ☐ 無欄位 | meetup 券不可配 | ◐ default only | **CC-RWD-03** |
| 5 | `restrictions.min_item_subtotal_hkd` | ☐ 無欄位 | subtotal gate 隱藏 | ◐ | CC-RWD-03 |
| 6 | `auth_escrow_config.*` | ◐ 部分 | 費用/checkout | INT 直寫 DB | CC-PLAT-01 |
| 7 | `commissionRate` | ☑ | payout 金額 | INT 直寫 DB | CC-PLAT-02 |
| 8 | `trigger_conditions.trade_count` | ☑ | 發券條件 | fixture 多 | ◐ |
| 9 | `redemption_catalog.*` | ☑ points mall | 積分兌換 | ◐ DB insert | phase4 |
| 10 | FPS fee / P2P AML | system-only | payout / meetup cap | ☑ mirror INT | deploy 變更 |

**原則：** 新 P0 鍵入表 → §5 checklist → SSOT L8。

---

## 6. 新 key / 新域 Checklist（每 PR 填）

```
[ ] Runtime key 已列本章或新增列
[ ] Admin 有欄位 OR docs 標 system-only + 原因
[ ] CC-UNIT（form default）
[ ] CC-INT（default publish / upsert 無 fixture override）
[ ] 若 Partner 會配置：CC-E2E journey 已加 SSOT §3 J-xxx
[ ] 若需 fixture override：檔頭 @rpc-edge-only + 唔作為 Admin 唯一證明
[ ] test-coverage-ssot.md changelog
```

---

## 7. CI 守衛（按域）

| Job | 守衛範圍 |
|-----|----------|
| PR `tsc` + `lint` + unit | CC-UNIT |
| `test:integration:rewards` | CC-INT rewards · member-auth-coupon（fixture） |
| `test:e2e:rewards-gate:production` | CC-E2E rewards P0（**含 TC-E13**） |
| `test:nightly:coverage` | platform CC-INT · cron TC-M01–M06 · appendix-A TC-M10–M42 · P2 E2E · matrix soak |
| `test:production:gate:signoff` | 商業主線 + rewards production E2E |

**原則：** P0 域至少 **CC-INT + CC-E2E** 其一不可長期為 ☐。

---

## Changelog

| 日期 | 變更 |
|------|------|
| 2026-08-16 | §5 P0 macro audit · CC-PLAT-02 · CC-RWD-02/03 · platform 明細 |
| 2026-08-16 | 初版：macro registry · rewards 明細 · platform gap · CC 三件套 |
