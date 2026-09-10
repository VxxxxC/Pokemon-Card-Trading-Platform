# PR3B / PR3C — Remaining moderation refund work (post-PR3A)

**SSOT:** [refund-policy.md](../../docs/dev/refund-policy.md) §5 / §8 / §11 / §12 · [refund-policy-rollout-plan.md](../../docs/dev/follow-up/refund-policy-rollout-plan.md) PR3 §3B–3C  
**Prerequisite:** PR3A ✅ — migration `20260913140000`, I-H10, §12 member finalize

**Scope:** Planning only. PR3B and PR3C are **separate PRs** (can ship independently; recommended order below).

---

## Execution gate (gated pipeline)

**Rule:** Do **not** start PR3C implementation until **Gate 1** passes. No exceptions.

### Gate 1 — PR3B complete → unlock PR3C

Run **sequentially** after PR3B code is done (migration, saga, UI, I-H15/I-H16):

```bash
bunx supabase db push
bun run test:integration:moderation
bunx tsc --noEmit
bun run lint
```

| Outcome | Action |
|---------|--------|
| **All pass** (exit 0; integration includes **I-H15**, **I-H16**) | ✅ Unlock PR3C implementation |
| **Any fail** | Fix PR3B only — **do not** start PR3C |

### Gate 2 — PR3C complete

Run after PR3C code is done (preview RPC, action, UI panel, unit tests):

```bash
bun run test:integration:moderation          # + I-H17 if added
bunx vitest run tests/unit/moderation/refund-preview.test.ts
bunx tsc --noEmit
bun run lint
```

| Outcome | Action |
|---------|--------|
| **All pass** | PR3C ready for merge / PR4 handoff |
| **Any fail** | Fix PR3C; re-run Gate 2 |

### Optional pre-release gate

After Gate 1 + Gate 2 both pass (staging / release candidate):

```bash
bun run test:moderation:gate:full
```

---

## Gap assessment (post-PR3A)

| Area | SSOT target | Current code | Gap |
|------|-------------|--------------|-----|
| Member S3 finalize (admin session) | ✅ | `20260913140000` + I-H10 | **Done (PR3A)** |
| Resolve UI `fault_party` | seller / buyer / platform / **carrier** / **inconclusive** | `DisputeDetailClient` + `types.ts` only 3 values | **PR3B** |
| `rpc_resolve_moderation_case` whitelist | all 5 enum values | rejects carrier/inconclusive (`20260910180000` L1146–1152) | **PR3B** |
| `fn_compute_moderation_order_refund` | carrier ≈ seller eligible; inconclusive full eligible; settlement flags per §5/§8 | only `settlementRequired` for seller; no breakdown | **PR3B** (+ **PR3C** for preview fields) |
| `rpc_finalize_moderation_order_refund` | carrier(seller logistics) → receivable; carrier(platform) → no receivable; inconclusive → no seller recovery + fee split | only seller fault → `seller_receivables` / `merchant_ledgers` | **PR3B** |
| `moderation-order-refund-saga.ts` | buyer deducts stripe fee; seller/carrier/inconclusive full policy refund | buyer-only fee deduct; `settlementRequired` from prepare only | **PR3B** |
| Admin amount preview (§2.1) | read-only 6-field breakdown before resolve | none | **PR3C** |
| `refund-policy.md` §12 | carrier/inconclusive S3 ✅ | ❌ 舉報 UI 未接 | **PR3B** docs |
| Integration I-H15 / I-H16 | rollout plan | not defined in `6phase-test-plan.md` | **PR3B** |

**Already aligned (no PR3B change for buyer path):** S3 eligible base (A+C, +D on platform fault), buyer stripe-fee deduction in saga, grading fail UI already exposes carrier/inconclusive (`AdminGradingClient.tsx`).

---

## Decisions (locked)

**Locked 2026-08-11** — implementation may proceed.

| IC | Choice | Rationale |
|----|--------|-----------|
| **IC-1** inconclusive Stripe fee | **Option A — 50/50 seller/platform** | SSOT §5 table default「各 50%」；買家仍收 full `eligible_policy`（唔扣 fee）。賣家追償 **僅 `stripe_fee_actual / 2`**（唔追 full refund）；另一半記 `platform_absorb_hkd`。§4 S1 inconclusive auth-fee goodwill **獨立**，唔混入 S3。 |
| **IC-2** carrier logistics liability | **Option A — `carrierLiabilityParty` UI** | SSOT §5/§8.2/§11 要求按「誰安排物流」分攤；heuristic 易誤判追償。與 grading enum 一致，resolve 時 **必填** `seller \| platform`。 |
| **IC-3** preview stripe fee source | **Option A — policy estimate** | Preview 唯讀、唔 call Stripe；`stripe_fee_hkd: null` + `stripeFeeNote` 標示 finalize 時讀 balance transaction。與 saga `extractStripeFeeHkd` 職責分離，staging 無 Stripe 仍可驗 UI。 |

### Plan fixes (from review)

1. **`settlementRequired` semantics (IC-1):** inconclusive 唔再簡單設 `false`。新增 prepare 欄位 `feeRecoveryMode: 'none' \| 'full' \| 'fee_half'`（或等價 `stripeFeeBearer`）：inconclusive → `fee_half`；carrier(seller) / seller → `full`；carrier(platform) / buyer / platform → `none`。Saga 僅在 `full` 或 `fee_half` 時傳 `p_stripe_fee_hkd`（後者傳 `fee/2`）。
2. **Persist `carrierLiabilityParty`:** PR3B migration 須寫入 `auth_notes`（`carrier_liability: seller\|platform`）或 audit payload，否則 `rpc_retry_moderation_order_refund_prepare` 無法還原 carrier(platform) vs carrier(seller)。
3. **Extend `rpc_prepare_moderation_order_refund`:** 計劃原只列 `fn_compute` / `rpc_resolve` — 須同步加參 `p_carrier_liability_party` 並傳入 compute。
4. **I-H16 assertion fix:** inconclusive + IC-1 → assert **seller_receivable 僅 `stripe_fee/2`**（唔係「no receivable」）；`platform_absorb` 另一半（integration 用 mock fee 或 seed）。
5. **I-H15b (optional):** carrier(platform) → refunded、**no** seller_receivable、platform absorb fee — 防 finalize 分支漏測。
6. **§8.2 test matrix:** `refund-policy.md` §8.2 表缺 inconclusive / carrier(platform) 列 — PR3B docs 或 unit fixture 補充；preview unit test 用 §5 + 計劃內 A=800,C=50,D=150,fee=30 範例。
7. **Grading UI parity:** `AdminGradingClient` 有 carrier/inconclusive 但 **無** `carrierLiabilityParty` — 仍屬 PR2+ / out of scope；PR3B 僅 dispute resolve UI。
8. **Rollout doc:** `refund-policy-rollout-plan.md` DB push 清單補 `20260914*` / `20260915*`；`PARTNER_QA_SIGNOFF` migration range 於 PR3B/C merge 後更新。

---

## ❓ Intent checks (superseded — see Decisions above)

<details>
<summary>Original IC options (archived)</summary>

### IC-1 — S3 `inconclusive` Stripe fee split

- **Option A (SSOT default):** 50/50 — **✅ locked**
- **Option B:** Platform absorb entire fee

### IC-2 — S3 `carrier` logistics liability

- **Option A:** `carrierLiabilityParty` UI — **✅ locked**
- **Option B:** Heuristic only

### IC-3 — PR3C preview stripe fee source

- **Option A:** Policy estimate — **✅ locked**
- **Option B:** Live Stripe PI

</details>

---

## PR3B — Carrier / inconclusive fault expansion

**Goal:** Phase H resolve end-to-end for `carrier` and `inconclusive` per SSOT §5 / §8 / §11.

### 1. Database migration `20260914xxxx_moderation_fault_carrier_inconclusive.sql`

| Function | Change |
|----------|--------|
| `rpc_resolve_moderation_case` | Whitelist `carrier`, `inconclusive`; validate `carrierLiabilityParty` when carrier (if IC-2 Option A) |
| `fn_compute_moderation_order_refund` | Add `p_carrier_liability_party`; return `feeRecoveryMode` / `stripeFeeBearer`, `authFeeRetainedHkd`; carrier(seller) → full recovery; inconclusive → fee_half (IC-1); carrier(platform) → none |
| `rpc_prepare_moderation_order_refund` | Accept + pass `p_carrier_liability_party`; persist liability in `auth_notes` for retry |
| `rpc_finalize_moderation_order_refund` | carrier(seller): receivable like seller; carrier(platform): skip receivable; inconclusive: receivable **fee/2 only** + platform absorb fee/2 (IC-1) |
| `rpc_retry_moderation_order_refund_prepare` | Recompute `settlementRequired` for carrier (not only seller) |

**Do not regress:** PR3A `set_config('moderation.order_refund')` wrappers in finalize / mark_failed / retry for `member_auth`.

### 2. Saga — `lib/payments/moderation-order-refund-saga.ts`

| Change | Rule |
|--------|------|
| `computeRefundCents` | Only `buyer` deducts stripe fee; `carrier` / `inconclusive` / `platform` / `seller` → full policy cents |
| `p_stripe_fee_hkd` on finalize | Pass when `feeRecoveryMode` is `full` (seller / carrier-seller) or `fee_half` (inconclusive, pass `fee/2`) |
| `parsePrepareModerationOrderRefundPayload` | Accept new prepare fields if added |

### 3. Backend actions — `app/actions/admin-moderation.ts`

- Extend `buildResolvePayload` / `ResolveAdminModerationCaseInput` (via `lib/moderation/types.ts`) for `carrier` | `inconclusive` and optional `carrierLiabilityParty`.
- Reuse `isGradingFaultParty` from `auth-grading-fail-void-saga.ts` for validation consistency.

### 4. Frontend — `app/admin/disputes/[id]/DisputeDetailClient.tsx`

**Addition-only per backend wire-up protocol:**

| Element | Detail |
|---------|--------|
| `<select name="faultParty">` | Add options: `carrier`（物流）, `inconclusive`（無法判定） |
| Conditional sub-select | When `carrier`: `carrierLiabilityParty` seller / platform (if IC-2 Option A) |
| Validation | Mirror platform reason: inconclusive may need optional admin note (product call) |
| `handleResolve` | Pass extended `orderRefund` to `resolveAdminModerationCase` |

**Also update:** `lib/moderation/types.ts` (`faultParty` union + `carrierLiabilityParty?`).

### 5. Tests

| ID | Scenario | File | Assert |
|----|----------|------|--------|
| **I-H15** | `member_auth` carrier (seller logistics): resolve → prepare → admin finalize | `tests/integration/moderation/phase-h-refund.integration.test.ts` | `fault_party=carrier`, `refunded`, **seller_receivables** row (fee + refund like I-H10 seller) |
| **I-H16** | `member_auth` inconclusive: resolve → prepare → admin finalize | same | `fault_party=inconclusive`, `refunded`, seller_receivable **= stripe_fee/2 only** (IC-1); no full-order recovery |

Optional unit tests:

- `tests/unit/moderation/moderation-refund-compute.test.ts` — pure TS mirror of §8.2 amounts (if logic extracted); else SQL integration only.

### 6. Docs (PR3B PR)

| File | Update |
|------|--------|
| `docs/dev/refund-policy.md` §12 | S3 carrier/inconclusive → ✅ |
| `docs/dev/follow-up/admin-moderation/6phase-test-plan.md` §1.6 | Add I-H15, I-H16 rows |
| `docs/dev/follow-up/admin-moderation/REFUND_ADMIN_PLAYBOOK.md` §5 | carrier/inconclusive ✅ |
| `docs/dev/follow-up/admin-moderation/backend.md` | Phase H fault matrix + `carrierLiabilityParty` contract |
| `docs/dev/follow-up/admin-moderation/frontend.md` | Resolve fault select spec |
| `docs/dev/follow-up/refund-policy-rollout-plan.md` | PR3 §3B checkbox |

### PR3B acceptance criteria

- [x] IC-1 and IC-2 confirmed — see **Decisions (locked)**
- [ ] Admin can resolve with carrier / inconclusive; invalid combo rejected at RPC
- [ ] `bun run test:integration:moderation` green including **I-H15**, **I-H16**
- [ ] `bunx tsc --noEmit` + `bun run lint` pass
- [ ] `refund-policy.md` §12 S3 carrier/inconclusive marked ✅
- [ ] No regression on I-H1–I-H10, I-H2, I-H3

### PR3B risks

| Risk | Mitigation |
|------|------------|
| Inconclusive fee split ambiguous | Block on IC-1 |
| Carrier mis-attribution without sub-field | Block on IC-2 Option A |
| finalize receivable logic drift | Copy seller branch pattern; integration asserts |

**Estimate:** 1 migration + saga patch + UI select + 2 integration tests (~1–1.5d)

---

## PR3C — Admin resolve amount preview (read-only)

**Goal:** Before「執行最終仲裁裁決」, show [refund-policy §2.1](../../docs/dev/refund-policy.md#21-breakdown-輸出格式admin對客) breakdown without mutating order or calling Stripe refund.

### 1. Database — `20260915xxxx_moderation_refund_preview.sql` (or extend existing fn)

**Preferred:** `fn_preview_moderation_order_refund_breakdown(p_order_id, p_fault_party, p_platform_fault_reason, p_carrier_liability_party DEFAULT NULL) RETURNS JSONB`

Output (all HKD, 2 dp):

```json
{
  "eligiblePolicyHkd": 850,
  "stripeFeeHkd": null,
  "stripeFeeNote": "finalize 時從 Stripe 讀取",
  "refundToBuyerHkd": 850,
  "authFeeRetainedHkd": 150,
  "sellerRecoveryHkd": 880,
  "platformAbsorbHkd": 0,
  "orderKind": "member_auth",
  "faultParty": "seller"
}
```

Implementation: delegate eligible base to `fn_compute_moderation_order_refund`; apply §5 fee rules in SQL or shared TS helper (keep single source — prefer SQL STABLE fn for preview = prepare consistency).

**Must not:** write orders, call Stripe, or bypass eligibility (`fn_moderation_order_refund_eligible` should gate preview action).

### 2. Server action — `app/actions/admin-moderation.ts`

```ts
previewModerationOrderRefund(input: {
  orderId: string;
  faultParty: GradingFaultParty;
  platformFaultReason?: string;
  carrierLiabilityParty?: 'seller' | 'platform';
}): ActionResult<ModerationRefundBreakdownPreview>
```

- Admin guard + eligibility check
- RPC `fn_preview_moderation_order_refund_breakdown`
- Return structured breakdown for UI

### 3. Types — `lib/moderation/types.ts`

Add `ModerationRefundBreakdownPreview` matching §2.1 fields (import enum from supabase types where possible).

### 4. Frontend — `app/admin/disputes/[id]/DisputeDetailClient.tsx`

**Addition-only:**

- When `executeOrderRefund && refundOrderId && faultParty`: debounced fetch preview (client `useEffect` or server action on select change)
- Read-only panel listing 6 breakdown rows (unstyled / placeholder OK)
- Loading + error states; hide when ineligible order

Optional: extract `ModerationRefundPreviewPanel.tsx` if file grows — not required for v1.

### 5. Tests

| Layer | File | Coverage |
|-------|------|----------|
| Unit | `tests/unit/moderation/refund-preview.test.ts` | seller / buyer / platform / carrier / inconclusive matrix vs §8.2 example (A=800,C=50,D=150,fee=30) |
| Integration | optional `I-H17` | RPC returns breakdown for seeded `member_auth` order (no finalize) |

### 6. Docs (PR3C PR)

| File | Update |
|------|--------|
| `docs/dev/follow-up/admin-moderation/frontend.md` | Preview panel acceptance |
| `docs/dev/follow-up/admin-moderation/backend.md` | `previewModerationOrderRefund` contract |
| `REFUND_ADMIN_PLAYBOOK.md` |「裁定前可預覽 breakdown」|

### PR3C acceptance criteria

- [x] IC-3 confirmed — see **Decisions (locked)**
- [ ] Preview visible when refund checkbox + order + fault selected
- [ ] Preview amounts match `fn_compute_moderation_order_refund` / §8.2 for seller, buyer, platform on `member_auth` fixture
- [ ] Resolve + actual refund flow **unchanged** (preview is read-only)
- [ ] `bunx tsc --noEmit` + `bun run lint` pass
- [ ] Works with PR3B fault types when PR3B merged (or graceful message if only 3 faults pre-3B)

### PR3C dependencies

| Dependency | Required? |
|------------|-----------|
| PR3A | Yes (member path stable) |
| PR3B | **Soft** — preview can ship with 3 faults first; extend breakdown rows when PR3B lands. **Recommend merge PR3B first** so preview covers full enum. |
| IC-3 | Yes (stripe fee display strategy) |

**Estimate:** 1 migration/RPC + 1 server action + UI panel + unit tests (~0.5–1d)

---

## Recommended merge order

```text
PR3A (done)
  → PR3B (carrier/inconclusive + I-H15/I-H16 + IC-1/IC-2)
  → PR3C (preview RPC + UI; benefits from full fault matrix)
  → PR4 (ToS / Partner QA spot checks including inconclusive playbook)
```

**DB push sequence (cumulative after PR3A):**

```text
… 20260913140000  (PR3A — done)
→ 20260914xxxx    (PR3B — fault expansion; Gate 1 db push)
→ 20260915xxxx    (PR3C — preview fn; Gate 2; separate PR preferred)
```

See **Execution gate** above — Gate 1 must pass before PR3C work starts; `test:moderation:gate:full` is optional pre-release only.

---

## Out of scope (remain deferred)

- Real Stripe E2E for member_auth refund (I-H14 is `merchant_direct` only)
- Appeal portal / listing report (v2)
- Persisting breakdown snapshot on order row at prepare time (optional future; not required for PR3C read-only)
- Grading fail S1 carrier/inconclusive UI gaps (grading UI already has options; saga matrix is PR2+ territory)

---

## Checklist summary

### PR3B

- [x] IC-1 inconclusive fee split confirmed (50/50)
- [x] IC-2 carrier liability UI confirmed (`carrierLiabilityParty`)
- [ ] Migration `20260914xxxx`
- [ ] Saga + finalize receivable branches
- [ ] DisputeDetailClient fault options
- [ ] I-H15, I-H16 green
- [ ] §12 + playbook updated

### PR3C

- [x] IC-3 stripe fee preview strategy confirmed (policy estimate)
- [ ] `fn_preview_moderation_order_refund_breakdown` + action
- [ ] Preview panel in resolve form
- [ ] Unit tests §8.2 matrix
- [ ] backend.md / frontend.md updated
