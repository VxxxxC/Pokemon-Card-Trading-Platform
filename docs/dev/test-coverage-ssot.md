# Test Coverage & Solidity SSOT — v2.5

> **版本：** v2.5 · **更新：** 2026-08-18  
> **終極 Checklist（功能全表）：** [system-feature-registry.md](./system-feature-registry.md) — Member / Merchant / Admin / System。  
> **Partner UI 回歸：** [partner-regression.md](./partner-regression.md) — P-A/B/C · SC-P*（**L4**，補 Gate/Nightly 漏嘅 Partner-path bug）。  
> **North star：** 功能表 **全 ☑** + `test:staging:certify` 綠 + **SC-P0 全 ☑** + Partner M0 = **Staging 可俾人用**。  
> **本文件：** 旅程（J-）、技術項（TC-）、矩陣、CC、安全 — 與功能表 ID 對照（registry §6）。

---

## 0. Staging 認證契約（v2.5 核心）

| 問題 | 答案 |
|------|------|
| 邊度係「全功能」清單？ | **[system-feature-registry.md](./system-feature-registry.md)**（F-M/C/A/S） |
| 邊度係 Partner bug 清單？ | **[partner-regression.md](./partner-regression.md)**（P-A/B/C） |
| 點樣試？ | §0 深度 T0–T3 + **P-Partner**；金流/券要 T1+T3；其餘 T2 主旅程 |
| 人手？ | **SC-P0 綠後** M0 ~5min；探索性 bug 先入 P-* 表 |
| 完成線？ | F-* 全 ☑ + certify 綠 + **SC-P0** + M0 |
| v3 唔計？ | [v3-deferred.md](./v3-deferred.md) |

**現況：** 約 **27/67** 功能 ☑（+6 ◐）— **未達 Staging 認證**。

**宏觀防線：** [config-contract-registry.md](./config-contract-registry.md)  
**唔取代：** [PRODUCTION_GATE.md](./PRODUCTION_GATE.md) · [test-solidity-plan.md](./test-solidity-plan.md) · [e2e-tiering.md](./e2e-tiering.md)

---

## 0.5 宏觀防線 — Config Contract Parity（全站）

> **Registry SSOT：** [config-contract-registry.md](./config-contract-registry.md)

| 域 | 代表風險 | CC-INT | CC-E2E | Backlog |
|----|----------|--------|--------|---------|
| **Rewards 券** | `restrictions.*` / `min_spend` 缺 UI / default 錯 | ☑ `admin-publish-defaults` | ☑ TC-E13 · C2C-ADM-1b | CC-RWD-03 hidden keys |
| **Platform 鑑定費** | test 直寫 DB、Partner 用 Admin | ☑ `auth-fee` · CC-PLAT-01 | ☑ | **CC-PLAT-01** |
| **Platform 佣金** | payout snapshot | ☑ `commission-rate` · CC-PLAT-02 | ☑ | **CC-PLAT-02** |
| **Moderation** | 退款規則 | ☑ matrix | ☑ J-MOD-01 | — |
| **Grading** | Admin 操作 | ☑ integration | ◐ | **CC-GRD-01** |
| **Cron HTTP** | route≠RPC | ☐ | — | TC-M01+ |

**新 PR：** 新 runtime 配置鍵 → 更新 registry + CC-UNIT + CC-INT（P0 加 CC-E2E）。

---

## 0. v2 核心改動（相對 v1）

| v1 問題 | v2 做法 |
|---------|---------|
| 「Gate = 視為 solid」 | Gate = **logic 簽收**；solidity 另用 **S0–S2** |
| 以 spec 檔打勾 | 以 **user journey** + 驗收句打勾 |
| 冇區分 fixture / partner path | 每條 P0/P1 標 **Path** + **In CI** |
| 組合覆蓋無處記 | **§7 Eligibility 矩陣** |
| ☑ = 有 test | ☑ = **Staging 認證用**：`Solid ≥ 目標` + `In CI` 非 Manual + 可更新 [staging-certification.md](./staging-certification.md) SC 行 |

**Incident 類型：** Config Contract Parity Gap（例 2026-08-16 `order_kinds`）— 見 registry · CC 三件套 §1.7。

---

## 1. 雙軸定義

### 1.1 Coverage（有冇自動化）

| Status | 意思 |
|--------|------|
| **Gate** | 已納入 `test:production:gate:signoff` |
| **Partial** | 有 test，但未完整 / opt-in / mock only |
| **HasTest** | repo 有 spec，未入 gate（nightly / PR optional） |
| **Missing** | 無 meaningful 自動化 |
| **Ops** | 人手／Dashboard，唔預期自動化 |
| **N/A** | 政策／零在途／out of scope |

### 1.2 Solidity（可否代替 Partner regression）

| 級 | 名稱 | 含義 | Partner skip regression |
|----|------|------|------------------------|
| **S0** | Spec exists | 有 test file；可能 fixture-only 或未入 CI | ❌ |
| **S1** | Matrix / logic | Eligibility **矩陣**（含 **negative**）或等價 integration FSM | 邏輯層可以 |
| **S2** | Partner-path | **(A)** Eligibility journey：**(S1 或等價 integration) 且** Partner E2E；**(B)** 非 eligibility journey：**全鏈 Partner E2E**（唔使矩陣） | ✅（該 journey + CI 綠） |

**v2.5：** S2 優先由 [partner-regression.md](./partner-regression.md) **P-*** 守衛；舊 gate/nightly spec 若 Path=Fixture-only **唔計** S2。

**Repo 級定義：** [test-solidity-plan.md §7](./test-solidity-plan.md)。

**非 eligibility journey（例：J-TRD、J-AUTH 全鏈）：** 唔需要 TC-N05 矩陣；**S2 = Partner E2E 覆蓋完整旅程**。

### 1.3 Path

| Path | 意思 |
|------|------|
| **Fixture** | `buildXxxInput()`、service role、DB seed |
| **Partner** | 產品 UI／正常用戶操作 |
| **Both** | Fixture 矩陣 + ≥1 Partner E2E |

⚠️ Fixture-only **永遠唔計 S2**。

### 1.4 In CI（邊個 job 守回歸）

| 值 | 意思 |
|----|------|
| **Gate** | `test:production:gate:signoff` |
| **Nightly** | `test:nightly:coverage`（03:00 HKT） |
| **Rewards** | `rewards.yml` → integration: `test:integration:rewards`；E2E: `test:e2e:rewards-gate` / `:production`（05:00 HKT） |
| **Manual** | 僅本地／`workflow_dispatch`；**唔算 S2 達標** |
| **—** | 未接入 |

### 1.5 進度欄（☐ / ◐ / ☑）

| 符號 | 條件 |
|------|------|
| **☑** | `Solid ≥ Solid 目標` **且** `In CI` ∈ Gate / Nightly / Rewards **且** 對應 [staging-certification.md](./staging-certification.md) SC 可標 ☑ |
| **◐** | 有 spec 或 CI 有跑，但未達認證 ☑（soak、Manual、缺 E2E、CC 缺口） |
| **☐** | 未開始或 Missing — **阻塞 Staging 認證** |

### 1.6 Partner 人手政策

| 場景 | 要求 |
|------|------|
| **Staging 已認證** deploy | Partner **M0 only**（~5 min） |
| Staging deploy（未認證） | M0 + 工程跟 SC ☐ 清單 |
| Journey 已 **☑ + In CI 綠** | Partner **唔** regression 該 journey |
| Nightly / Rewards 紅 | 工程修 |
| 新功能首次 | 探索性 QA |

### 1.7 Config Contract 三件套（CC）

| 代號 | 驗證 | Artifact |
|------|------|----------|
| **CC-UNIT** | Form default / type-change | `template-form-catalog.test.ts` |
| **CC-INT** | `publishActivity(defaultForm)` 無 fixture override | `admin-publish-defaults.integration.test.ts` |
| **CC-E2E** | Admin UI → 用戶（可測 default 唔 click 欄位） | `member-auth-coupon-admin` |

Fixture 標 `@rpc-edge-only`；唔作 Admin 唯一證明（registry §3.3）。

---

## 2. v2.1 商業主線 — Gate re-audit

`test:production:gate:signoff` = **認證必要步驟（SC-G01）** · 單獨跑唔等於 Staging 已認證（尚需 §2 SC 全 ☑ + nightly/security）。

| 域 | Gate 涵蓋 | Solid | Path | Gap / next |
|----|-----------|-------|------|------------|
| S0–S1 鑑定 | cancel · fail 矩陣 · pass · merchant 對稱 · stripe smoke | S1 | Fixture | Admin 入庫 partner E2E 薄 |
| S3 售後 | Phase H · I-H14 · C7 | S1–S2 | Both | 部分 admin 配置缺 partner-path |
| S4 出款 | FPS · Connect pipeline | S1 | Fixture | TC-M10 |
| **Coupon / checkout** | FSM · member auth coupon · reconcile · C8 | **S1–S2** | Both | matrix soak；CC-PLAT 等其他域 |
| Moderation | matrix · E2E · mutation | S1–S2 | Both | — |
| Webhook | C1 HTTP | S1 | Fixture | TC-P01 |
| Smoke | home · legal · admin grading guest | S2 | Partner | M1 重疊 |

**Re-audit：** ◐（2026-08-16 起）

---

## 3. P0 / P1 旅程登記表

| ID | Journey | 目標 | Path | In CI | Artifact（Partner / 邊界） | Solid | 進度 |
|----|---------|------|------|-------|---------------------------|-------|------|
| **J-CPN-01** | Admin 發布免運 → B2C 直購 checkout 可用 | S2 | Partner | Rewards | **Partner:** `platform-rewards-phase2` · **邊界:** `rewards-checkout-coupon`（min spend / meetup；免運或 reuse audit template） | S2 | ☑ |
| **J-CPN-02** | Admin 發布免運 → B2C 鑑定 checkout 可用 | S2 | Partner | Rewards | `platform-rewards-phase2` B2b.2 | S2 | ☑ |
| **J-CPN-03** | Admin 發布免運（含 C2C）→ C2C 鑑定 checkout eligible | S2 | Partner | **Rewards** | **Partner:** `member-auth-coupon-admin`（TC-E13）· *唔計 S2:* `member-auth-coupon.integration`（fixture `order_kinds`） | S2 | ☑ |
| **J-CPN-04** | C2C 鑑定 + 折扣券 → checkout **必須灰** | S1 | Fixture | Gate integration | `member-auth-coupon.integration` | S1 | ☑ |
| **J-CPN-05** | Flash 搶券 → wallet → merchant checkout | S2 | Partner | Rewards | `platform-rewards-phase3` C3.7 | S2 | ☑ |
| **J-CPN-06** | 積分兌換 → wallet → checkout | S2 | Partner | Rewards | `platform-rewards-phase4`（checkout 未完整） | S1 | ◐ |
| **J-CPN-07** | **Default Admin form** publish → DB `restrictions` 正確（無 fixture override） | S1 | Fixture | Rewards | `admin-publish-defaults.integration` | S1 | ☑ |
| **J-MOD-01** | 舉報 → Admin 退款 → Stripe reconcile | S2 | Partner | Gate | `moderation-stripe-refund-smoke` | S2 | ☑ |
| **J-AUTH-01** | C2C 鑑定 offer → accept → pay → escrow | S2 | Partner | Manual‡ | `member-auth-escrow` 等 | S1 | ◐ |
| **J-TRD-01** | C2P 面交全鏈 | S2 | Partner | Nightly | `member-trading-p2p` | S2 | ☑ |
| **J-TRD-02** | 議價 offer | S2 | Partner | Nightly | `member-offer-negotiation` | S2 | ☑ |

---

## 4. Partial（Gate 收緊候選）

| ID | Flow | Coverage | 目標 | Path | In CI | Artifact | Solid | 進度 | Next |
|----|------|----------|------|------|-------|----------|-------|------|------|
| **TC-P01** | Coupon release on `PI.cancel` HTTP | Partial | S1 | Fixture | Gate partial | `webhook-route` C1-6 · `coupon-webhook` | S1 | ☑ |
| **TC-P02** | Grading fail webhook 全鏈 | Partial | S1 | Fixture | Gate partial | `webhook-route` C1-7 · unit saga | S1 | ☑ |
| **TC-P03** | S2 pass 前 dispute | Partial | S1 | Fixture | Gate partial | `auth-grading-pre-confirm-dispute` | S1 | ☑ |
| **TC-P04** | Connect payout 零 skip | Partial | S1 | Fixture | Gate | `merchant-connect-payout-pipeline` M1–M4 | S1 | ☑ |
| **TC-P05** | Rewards matrix E2E | Partial | S1 | Fixture | Nightly + Rewards dispatch | `platform-rewards-matrix` | S1† | ☑ | — |
| **TC-P06** | Staging webhook replay | Ops | — | — | — | — | — | — | PG-WH-03 |
| **TC-P07** | Legacy C6 | N/A | — | — | — | — | — | — | — |

† **TC-P05 / TC-N05：** matrix **cases 已有** → Solid **S1**；soak **3/3 ☑**（§10）— production gate 仍 opt-in 直至 signoff 全綠。

---

## 5. Nightly / PR optional

### 5.1 Integration

| ID | 模組 | 目標 | Path | In CI | Spec | Solid | 進度 |
|----|------|------|------|-------|------|-------|------|
| **TC-N01** | Platform legal | S1 | Fixture | Nightly | `platform-legal.integration` | S1 | ☑ |
| **TC-N02** | Auth fee | S1 | Fixture | Nightly | `auth-fee.integration` | S1 | ☑ |
| **TC-N03** | P2P AML | S1 | Fixture | Nightly | `p2p-aml-limits.integration` | S1 | ☑ |
| **TC-N04** | Announcements | S2 | Partner | announcements gate | `test:announcements:gate` | S1 | ☑ |
| **TC-N05** | Rewards eligibility 矩陣 | S1 | Fixture | Nightly | `rewards-matrix.integration`（**B2C 為主**） | S1† | ☑ |

### 5.2 E2E

| ID | 優先 | Journey | 目標 | Path | In CI | Spec | Solid | 進度 |
|----|------|---------|------|------|-------|------|-------|------|
| **TC-E01** | P2 | C2P 面交 | S2 | Partner | Nightly | `member-trading-p2p` | S2 | ☑ |
| **TC-E02** | P2 | 議價 | S2 | Partner | Nightly | `member-offer-negotiation` | S2 | ☑ |
| **TC-E03** | P2 | Chat realtime | S1 | Partner | Nightly | `global-chat-realtime` | S1 | ☑ |
| **TC-E04** | P3 | 市集搜尋 | S1 | Partner | Partner UI | `p-e04-marketplace-search` | S1 | ☑ |
| **TC-E05** | P3 | Buy-now UI | S1 | Partner | Partner UI | `p-e05-merchant-buy-now` | S1 | ☑ |
| **TC-E06** | P3 | Dashboard | S1 | Partner | Partner UI | `p-e06-member-dashboard` | S1 | ☑ |
| **TC-E07** | P3 | Collection | S1 | Partner | Partner UI | `p-e07-member-collection` | S1 | ☑ |
| **TC-E08** | P2 | C2C 鑑定 escrow | S2 | Partner | Partner escrow | `p-e08-c2c-auth-escrow` | S1 | ☑ |
| **TC-E09** | P3 | Admin 周邊 | S1 | Partner | Partner journey | `p-e09-admin-periphery` | S1 | ☑ |
| **TC-E10** | P2 | 積分／訂單詳情券 | S2 | Partner | Partner journey | `p-e10-rewards-coupon` | S1 | ☑ |
| **TC-E11** | P2 | Trading smoke／filters | S2 | Partner | Partner journey | `p-e11-trading-smoke-filters` | S1 | ☑ |
| **TC-E12** | P3 | 訂單詳情／profile | S1 | Partner | Partner journey | `p-e12-order-detail-profile` | S1 | ☑ |
| **TC-E13** | P1 | Admin 建券 → C2C 鑑定 checkout eligible | S2 | Partner | **Rewards** | `member-auth-coupon-admin` | S2 | ☑ |

‡ `member-trading` project specs — **未**入 `test:nightly:coverage`；要 ☑ 需接入 nightly 或 rewards gate。

---

## 6. Missing backlog

### 6.1 Cron HTTP

| ID | Route | Status | 目標 | 進度 |
|----|-------|--------|------|------|
| **TC-M01** | `/api/cron/expire-merchant-pending-payment` | `cron-routes.integration` | S1 | ☑ |
| **TC-M02** | `/api/cron/release-stale-coupon-reserves` | `cron-routes.integration` | S1 | ☑ |
| **TC-M03** | `/api/cron/member-fps-payout-ready` | `cron-routes.integration` | S1 | ☑ |
| **TC-M04** | `/api/cron/merchant-connect-payout-ready` | `cron-routes.integration` | S1 | ☑ |
| **TC-M05** | `/api/cron/ingest-platform-trades` | `cron-routes.integration` | S0 | ☑ |
| **TC-M06** | `/api/cron/aggregate-prices` | `cron-routes.integration` | S0 | ☑ |

### 6.2–6.5 詳表

見 **附錄 A**（Connect/KYC、交易社交、Upload、Admin）。

---

## 7. Eligibility 與合約覆蓋

> **分兩層：** (A) **CC-INT/E2E** = Admin 配置會否寫入 DB（防 order_kinds 類）；(B) **Matrix** = 組合／negative（`rewards-matrix` 等）。  
> **C2C `order_kinds`：** Matrix **唔 cover**；靠 **CC-INT + TC-E13**（registry §3.1）。

### 7.1 Rewards checkout — 合約 (CC) + 組合 (Matrix)

| 維度 | CC-INT default | CC-E2E Partner | Matrix B2C (TC-N05) | Negative |
|------|----------------|----------------|---------------------|----------|
| `order_kinds` (incl. C2C) | ☑ J-CPN-07 | ☑ TC-E13 · C2C-ADM-1b | —（無 member） | C2C+僅 merchant→灰 |
| `type` | ☑ | phase2 · J-CPN-04 | ☑ | C2C+discount→灰 |
| `requires_authentication` | ◐ default inherit | phase2 auth toggle | ☑ | 僅非鑑定+auth→灰 |
| `shipping_methods` | ◐ default only | B3.3 · rewards-checkout | ☑ | meetup+僅 sf→灰 |
| `min_spend` / `max_subsidy` | ☑ | rewards-checkout-coupon | ☑ | 未達標→灰 |
| reserve / expiry / used | — | E2E-C4 | ☑ integration FSM | 過期→灰 |

**Soak：** ☑ 3/3（§10）— matrix 穩定度達標；production 仍要 `PRODUCTION_GATE_INCLUDE_MATRIX=1` signoff 全綠。

### 7.2 Moderation refund — eligibility + finalize 矩陣

> **Journey：** J-MOD-01（Partner E2E）· **Logic：** `phase-h-refund.integration` · **Sanctions／舉報：** `moderation-matrix.integration`（唔係退款矩陣）  
> **政策 SSOT：** [refund-policy.md](./refund-policy.md) · **Gate：** `moderation-release-gate.sh` + signoff `moderation-stripe-refund-smoke`（I-H14）

#### 7.2.1 訂單種類 × prepare / finalize

| 維度 | Integration（`phase-h-refund`） | E2E Partner | Negative / edge | 進度 |
|------|--------------------------------|-------------|-----------------|------|
| `merchant_direct` eligible + prepare | ☑ I-H1 | ☑ I-H14 `moderation-stripe-refund-smoke` | I-H7 無關訂單 | ☑ |
| `merchant_auth` eligible + prepare | ☑ I-H2 | ☑ P-E17 | — | ☑ |
| `merchant_auth` admin finalize + ledger | ☑ I-H2M | ☑ P-E18 | — | ☑ |
| `member_auth` eligible + prepare | ☑ I-H3 | ☑ P-E17 | — | ☑ |
| `member_auth` admin finalize | ☑ I-H10 | ☑ P-E18 | — | ☑ |
| 退款時窗外 | ☑ I-H4 | — | prepare 拒絕 | ☑ |
| resolve 唔選退款 | ☑ I-H5 | — | `refund_status` 不變 | ☑ |
| `upheld_warn_only` + refund | ☑ I-H6b | — | 無 sanction | ☑ |
| payout 候選排除 failed refund | ☑ I-H12 | — | — | ☑ |
| preview 唔 mutate | ☑ I-H17 | — | — | ☑ |
| failed refund retry（C7） | ☑ I-H18 | — | saga replay | ☑ |

#### 7.2.2 Fault / carrier / inconclusive（member ↔ merchant_auth 對稱）

| `fault_party` | `carrier_liability` | member_auth | merchant_auth | 進度 |
|---------------|---------------------|-------------|---------------|------|
| `carrier` | `seller` | ☑ I-H15（seller receivable） | ☑ I-H15M（merchant ledger recovery） | ☑ |
| `carrier` | `platform` | ☑ I-H15b | ☑ I-H15bM | ☑ |
| `inconclusive` | — | ☑ I-H16（`stripe_fee/2`） | ☑ I-H16M | ☑ |
| `seller`（default prepare） | — | ☑ I-H3 / I-H10 | ☑ I-H2 / I-H2M | ☑ |
| `buyer` fault | — | ☑ I-H3b | ☑ I-H2b | ☑ |

**Gap / next：** E2E 有 **merchant_direct** 全鏈（I-H14）同 **auth** admin prepare（P-E17）；finalize + Stripe terminal 仍靠 integration。**P2P 面交**永不平台退款 = 永久政策（F-S-13 · `p2p-dispute-no-refund`）。

---

### 7.3 Auth escrow FSM — grading fail / pass / cancel

> **Logic Gate：** `test:integration:grading`（`auth-grading-*`）· **Stripe smoke：** `grading:stripe-smoke` · `grading:pass-stripe-smoke` · **E2E：** `admin-grading`（guest smoke）· `verify:merchant-grading-e2e`（merchant，opt-in）  
> **政策 SSOT：** [refund-policy.md §7.2–7.3](./refund-policy.md) · [escrow-payment-policy.md](./escrow-payment-policy.md)

#### 7.3.1 Happy path + admin ops

| 維度 | member_auth | merchant_auth | E2E Partner | 進度 |
|------|-------------|---------------|-------------|------|
| custody → pass → outbound → confirm | ☑ G-W2 | ☑ G-W2M | ☑ P-E14 outbound · P-E13 tabs · guest `admin-grading` | ◐ |
| admin outbound / tracking（G-W1） | ☑ | ☑ | ☑ P-E14 | ☑ |
| buyer confirm guard（未 fully captured） | ☑ G-CONF1 | ☑ G-CONF1M | ☑ P-E15 · P-E16 | ☑ |
| pass + real Stripe capture | ☑ G-BP-S1 | ☑ G-BP-S1M | ☐ | ☑ |

#### 7.3.2 Fail fault 矩陣（`escrow_capture_model = single`）

| `fault_party` | member_auth | merchant_auth | Stripe smoke | 進度 |
|---------------|-------------|---------------|--------------|------|
| `buyer` prepare + finalize | ☑ G-BF1 · G-BF3 | ☑ G-BF1M · G-BF3M | ☑ G-BF-S1 | ☑ |
| `seller` prepare | ☑ G-BF2 | ☑ G-BF2M | — | ☑ |
| `seller` finalize | ☑ G-BF4 | ☑ G-BF4M | ☑ G-BF-S2 | ☑ |
| `carrier` + `seller` liability | ☑ G-BF6 | ☑ G-BF6M | — | ☑ |
| `carrier` + `platform` liability | ☑ G-BF7 | ☑ G-BF7M | — | ☑ |
| `carrier` 缺 liability | ☑ G-BF8 | ☑ G-BF8M | — | ☑ |
| `platform` | ☑ G-BF10 | ☑ G-BF10M | — | ☑ |
| `inconclusive` | ☑ G-BF11 | ☑ G-BF11M | — | ☑ |
| cancel race（void before finalize） | ☑ G-BF5 | ☑ G-BF5M | — | ☑ |
| coupon restore（seller fault） | ☑ G-C1 | ☑ G-C1M | — | ☑ |

#### 7.3.3 Legacy staged + cancel FSM

| 維度 | Coverage | Artifact | 進度 |
|------|----------|----------|------|
| Legacy seller fault `capture_zero` | ☑ | G-LF1 · G-LF2（real PI） | ☑ |
| Seller cancel before intake | ☑ | G-CAN1–G-CAN3 | ☑ |
| Merchant cancel symmetry | ☑ | `auth-grading-merchant-cancel` | ☑ |

**Gap / next（CC-GRD-01 · §2 re-audit）：**

- **Partner-path 薄：** Admin grading 有 P-E13 tab smoke + P-E14 outbound + guest `admin-grading`；G-CONF1 UI guard = P-E15/P-E16；opt-in `verify:merchant-grading-e2e` 仍非 nightly。
- **member ↔ merchant 對稱：** G-BF2M ☑ · G-BP-S1M ☑（`test:integration:grading:pass-stripe-smoke`）。
- **唔屬 CC 域：** grading fault 由 Admin dispute UI 選項驅動（`mapResolutionOptionToInput`），唔係 `reward_templates` 類 config parity；防線係 **FSM integration 矩陣**，唔係 CC-INT。

---

## 8. 實施順序（= Staging 認證必經路徑）

> **Exit：** [staging-certification.md](./staging-certification.md) §2 全 ☑ + `bun run test:staging:certify`。

| Phase | 目標 | IDs | SC | 進度 |
|-------|------|-----|-----|------|
| **L0** | SSOT v2.3 + registry + certify 腳本 | §0 · registry · scripts | SC-L00 | ◐ |
| **L1** | Nightly P2 E2E 穩定 | TC-E01–E03 | SC-T03 | ☑ |
| **L2** | Platform integration nightly | TC-N01–N03 | SC-T02 | ☑ |
| **L3** | Matrix soak → gate | TC-P05 · TC-N05 | SC-G05 · SC-T01 | ☑ 3/3 |
| **L4** | Cron HTTP | TC-M01–M06 | SC-M01 | ☑ |
| **L5** | Connect/KYC · upload · trading · **TC-M42 finance RPC** | TC-M10–M25 · M30–M31 · M40–M42 | SC-M02 | ☑ |
| **L6** | Member-trading 入 CI | TC-E08 · E11 · J-AUTH-01 | SC-J05 · SC-T03 | ◐ |
| **L7** | Admin default contract (CC-INT) | J-CPN-07 | SC-J03 | ☑ |
| **L8** | 全站 CC | CC-PLAT/RWD/GRD | SC-CC01–04 | ☐ |
| **L9** | 功能表全 ☑（registry §1–4） | F-M/C/A/S | SC-FX-ALL | ☑ |
| **L10** | Security mutation 入 certify | SEC-S03 · S06 | SC-S03 · SC-S06 | ☐ |
| **L11** | Nightly 接入所有 Nightly† spec | registry † 行 | SC-G02 | ◐ |

---

## 9. CI 分工

| Workflow | Schedule | 內容 | 相關 TC |
|----------|----------|------|---------|
| **nightly-test-coverage** | 03:00 HKT | L2 platform INT → **L4 cron (TC-M01–M06)** → **L5 appendix-A (TC-M10–M42 incl. M42 RPC)** → L2 UI → L1 P2 E2E → L6 member → L3 matrix（**唔含** `test:integration:rewards`） | E01–E03 · **M01–M06 · M10–M42** · P05 · N01–N03 · N05 |
| **rewards.yml** `rewards-integration` | 05:00 HKT 前 | `test:integration:rewards`（**CC-INT**） | J-CPN-07 · member-auth-coupon |
| **rewards.yml** `rewards-e2e` | 05:00 HKT | `test:e2e:rewards-gate:production`（**TC-E13** · C2C-ADM-1b） | J-CPN-01–05 |
| **rewards.yml** dispatch / PR `rewards` | on-demand | `test:e2e:rewards-gate`（full + matrix） | + P05 matrix |
| **production-gate** | sign-off | 見 PRODUCTION_GATE | Gate 域 |

本地：`bun run test:nightly:coverage` · `bun run test:e2e:rewards-gate:production`

---

## 10. TC-P05 Matrix soak tracker

| # | Date (HKT) | Run | Streak |
|---|------------|-----|--------|
| 1 | 2026-08-16 | local `test:nightly:coverage` ✅ | **1/3** |
| 2 | 2026-08-20 | local `test:e2e:nightly:matrix` + `test:integration:rewards-matrix` ✅ | **2/3** |
| 3 | 2026-08-20 | local `test:e2e:nightly:matrix` + `test:integration:rewards-matrix` ✅ | **3/3** |

**Exit：** 3/3 ✅ → 可跑 `PRODUCTION_GATE_INCLUDE_MATRIX=1 bun run test:production:gate:signoff`。

---

## 11. L6 Member-trading 診斷

| Spec | In CI | Solid | 進度 |
|------|-------|-------|------|
| `test:e2e:nightly:member`（bundle） | Nightly L6 | — | ◐ |
| `member-trading-smoke` | Nightly L6 | S1 | ◐ |
| `member-trading-filters` | Nightly L6 | S1 | ◐ |
| `member-order-detail-p2p` | Nightly L6 | S1 | ◐ |
| `member-order-detail-auth` | Nightly L6 | S1 | ◐ |
| `member-auth-inbound` | Nightly L6 | S1 | ◐ |
| `member-auth-escrow` | Nightly L6 | S1 | ◐ |
| `merchant-product-detail` | Nightly L6 | — | ☑ |

**2026-08-16 L6 再跑：** `test:e2e:nightly:member` → **61 passed · 15 failed · 96 skipped**（~12 min）。  
仍 fail：dashboard、auth-settings、makeOffer journey、escrow/order-detail 全鏈、username profile、部分 wishlist。

‡ 要 registry ☑ → nightly 綠 + 更新 `system-feature-registry.md` 該行。

---

## 12. PR checklist

Touch **任何** Admin 配置或 runtime eligibility：

- [ ] 更新 [config-contract-registry.md](./config-contract-registry.md) 列
- [ ] CC-UNIT（form default）
- [ ] CC-INT（default publish，無 fixture override）
- [ ] P0：CC-E2E + **In CI** 欄
- [ ] Fixture override 標 `@rpc-edge-only`
- [ ] Changelog §13

詳細：[test-solidity-plan.md §3](./test-solidity-plan.md) · [registry §6](./config-contract-registry.md)

---

## 13. Changelog

| 日期 | 變更 |
|------|------|
| 2026-08-20 | **v2.16：** G-BP-S1M merchant pass stripe smoke · L6 collection/offer E2E hardening |
| 2026-08-20 | **v2.15：** CC-PLAT-01/02 admin settings contract · G-BF2M merchant fail prepare |
| 2026-08-20 | **v2.12：** TC-P05 matrix soak **2/3**（L3 E2E + integration 全綠） |
| 2026-08-20 | **v2.11：** TC-E09–E12 Partner journey `p-e09`–`p-e12` · `test:e2e:partner-journey` |
| 2026-08-20 | **v2.10：** TC-E08 Partner escrow `p-e08-c2c-auth-escrow` · `test:e2e:partner-escrow` |
| 2026-08-20 | **v2.9：** Gate 收緊 TC-P01/P02/P04 · `test:gate:partial` · webhook C1-6/7 |
| 2026-08-20 | **v2.8：** TC-E04–E07 Partner UI specs · `test:e2e:partner-ui` |
| 2026-08-20 | **v2.7：** 附錄 A.2 TC-M20–M25 · A.4 TC-M40–M42 integration ☑ · `test:integration:appendix-a` |
| 2026-08-18 | **v2.5：** [partner-regression.md](./partner-regression.md) L4 · SC-P* · S2 綁定 P-* |
| 2026-08-16 | **v2.4：** [system-feature-registry.md](./system-feature-registry.md) 全功能終極表 Member/Merchant/Admin/System |
| 2026-08-16 | **v2.3：** staging-certification · certify 腳本 |
| 2026-08-16 | **v2.2：** §7.2/7.3 矩陣 · registry macro |
| 2026-08-16 | **v2.1 修訂：** In CI · ☑ 定義 · TC-E13 → rewards-gate:production |
| 2026-08-16 | **v2：** Coverage ≠ Solidity · Journey 表 · §7 矩陣 |
| 2026-08-16 | C2C coupon · TC-E13 · test-solidity-plan |
| 2026-08-16 | v1 nightly CI · L6 診斷 |

---

## 14. 相關文件

| 文件 | 角色 |
|------|------|
| [config-contract-registry.md](./config-contract-registry.md) | **全站** Admin↔Runtime 合約明細 |
| [test-solidity-plan.md](./test-solidity-plan.md) | Fixture parity · 三層防禦 |
| [PRODUCTION_GATE.md](./PRODUCTION_GATE.md) | v2.1 logic 簽收 |
| [v2.1-deferred.md](./v2.1-deferred.md) | v2.1 專項 |
| [e2e-tiering.md](./e2e-tiering.md) | Gate vs nightly spec 清單 |
| [system-feature-registry.md](./system-feature-registry.md) | **終極功能 Checklist（Staging exit）** |
| [staging-certification.md](./staging-certification.md) | 認證執行契約 + gate 跑數 |
| [v3-deferred.md](./v3-deferred.md) | 唔計認證嘅 v3+ 功能 |
| [PARTNER_QA.md](./PARTNER_QA.md) | M0 smoke（認證後） |

---

## 15. 安全 / 濫用防線（Staging 認證必達）

| ID | 威脅 | Artifact | In CI | Solid | 進度 | SC |
|----|------|----------|-------|-------|------|-----|
| **SEC-01** | 券濫用 R-01..R-03 | `coupon-security.integration` | Gate | S1 | ☑ | SC-S01 |
| **SEC-02** | 券 FSM 邊界 PBT | `coupon-pbt.integration` | Gate partial | S1 | ☑ | SC-S02 |
| **SEC-03** | Rewards mutation 存活 | `test:rewards:mutation` + contract test | Certify | S1 | ☑ P-SEC03 | SC-S03 |
| **SEC-04** | Moderation mutation | `test:moderation:mutation` | Signoff | S1 | ☑ | SC-S04 |
| **SEC-05** | Moderation PBT | `test:integration:moderation:pbt` | Gate | S1 | ☑ | SC-S05 |
| **SEC-06** | E2E 關鍵 skip = 假綠 | TC-E13 fail-if-env-missing | Rewards | S2 | ☑ P-SEC06 | SC-S06 |
| **SEC-07** | Admin↔Runtime parity | CC 三件套 + registry | Gate/Rewards | S1 | ◐ | SC-CC01 |

---

## 附錄 A — Missing 詳表 · Out of scope

### A.1 Stripe Connect / KYC

| ID | Flow | Status | Solid 目標 | 進度 |
|----|------|--------|------------|------|
| **TC-M10** | `/api/stripe/connect/onboard` · `return` · `dashboard` | `connect-routes.integration` | S1 | ☑ |
| **TC-M11** | `admin-kyc` · `merchant-kyc` · `kyc/upload-document` | `admin-kyc-list` · `merchant-kyc` · `tc-m31-upload-routes` | S1 | ☑ |

### A.2 交易／社交

| ID | Flow | Status | Solid 目標 | 進度 | 備註 |
|----|------|--------|------------|------|------|
| **TC-M20** | P2P 面交全鏈 | `tc-m20-p2p-handover.integration` | S2 | ☑ |
| **TC-M21** | Chat server actions | `chat-actions.integration` | S1 | ☑ |
| **TC-M22** | Reviews / 評價 | `tc-m22-reviews.integration` | S1 | ☑ |
| **TC-M23** | Collection / wishlist / inventory | `tc-m23-collection-wishlist.integration` | S1 | ☑ |
| **TC-M24** | Merchant 直購 checkout→paid | `tc-m24-buy-now.integration` | S2 | ☑ |
| **TC-M25** | Member 非鑑定 complete/cancel | `tc-m25-member-order-mutations.integration` | S1 | ☑ |

### A.3 Upload / 媒體 API

| ID | Route | Status | 進度 |
|----|-------|--------|------|
| **TC-M30** | `profile/upload-avatar` · `listings/upload-image` | `tc-m30-upload-routes.integration` | ☑ |
| **TC-M31** | `reports/upload-evidence` · `merchant/upload-*` | `tc-m31-upload-routes.integration` | ☑ |
| **TC-M32** | `admin/upload-announcement-image` | HasTest | ☑ |

### A.4 Admin / 營運

| ID | Flow | Status | 進度 |
|----|------|--------|------|
| **TC-M40** | `admin-member-orders` | `admin-member-orders.integration` | ☑ |
| **TC-M41** | Daily check-in program | `admin-check-in-program.integration` | ☑ |
| **TC-M42** | `merchant-finance` · dashboards | `tc-m42-merchant-finance.integration` | ☑ |

### A.5 v3+ Deferred（唔計 Staging 認證）

見 **[v3-deferred.md](./v3-deferred.md)** — 唔再佔本 SSOT「全表完成」分母。
