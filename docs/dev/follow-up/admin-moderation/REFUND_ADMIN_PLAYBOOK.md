# Admin 退款操作速查（Playbook）

> **完整 SSOT**：[refund-policy.md](../../refund-policy.md)  
> **Capture／出款**：[escrow-payment-policy.md](../../escrow-payment-policy.md)  
> **Target vs code 缺口**：[refund-policy §12](../../refund-policy.md#12-實作對照與缺口)

---

## 1. 揀邊條通道

| 階段 | 通道 | Admin 入口 |
|------|------|------------|
| **S1** 鑑定 fail（入庫後、pass 前） | Grading fail saga | `/admin/grading` → Fail |
| **S3** 收貨後售後（鑑定 pass 後） | Phase H moderation refund | `/admin/disputes/[id]` → Resolve + 勾選退款 |

**唔經平台退款：** P2P（`member_p2p`）— 僅制裁，無 refund RPC。

---

## 2. 點揀 `fault_party`

| 事實 | 建議 fault |
|------|------------|
| 假卡、嚴重與 listing 不符 | **seller** |
| 買家寄錯卡、調包 | **buyer** |
| 鑑定中心操作錯誤 | **platform**（須原因） |
| 物流損毀（賣家安排寄件） | **carrier**（承擔方 = seller） |
| 證據不足 | **inconclusive** |

Grading fail 與 Phase H 共用 `grading_fault_party` enum。Resolve UI 支援 seller / buyer / platform / carrier / inconclusive。

**裁定前預覽（PR3C）：** 勾選售後退款並選好訂單 + fault 後，工作台顯示唯讀 breakdown（政策估算；Stripe fee 於 finalize 讀取）。

---

## 3. Breakdown 五欄（Admin／對客）

```text
eligible_policy_hkd     … 政策可退基數（未扣 Stripe fee）
stripe_fee_hkd          … 不可回收 processing fee（若適用）
refund_to_buyer_hkd     … 實際 Stripe 退畀買家
auth_fee_retained_hkd   … 留平台嘅鑑定費（0 = 已退畀買家）
seller_recovery_hkd     … 向賣家／商戶追償總額（含 fee 若 seller fault）
```

金額組成：**A** 卡價 · **B** 入庫運費 · **C** 出庫運費 · **D** 鑑定費 · **T** = 買家總付。

---

## 4. 常見情境速查

### S1 — Grading fail（single capture）

| fault | 買家實收（target） | D |
|-------|-------------------|---|
| seller（假卡） | **T** 全額 | 退畀買家 |
| buyer（寄錯） | **A+B+C** | **留平台** |
| platform / carrier / inconclusive | **T** | 退畀買家 |

### S3 — 售後（鑑定 pass 後，窗口內）

| orderKind | eligible（除 platform fault） |
|-----------|-------------------------------|
| `merchant_direct` | buyer_total |
| `merchant_auth` / `member_auth` | **A+C**（唔含 D） |

| fault | Stripe fee |
|-------|------------|
| seller | 追賣家／merchant ledger |
| buyer | 減退款額 |
| platform | 平台 absorb |

---

## 5. Target vs code（2026-08-10）

| 規則 | 狀態 |
|------|------|
| S1 buyer fault single 留 D | ✅ `20260912120000` |
| S3 member_auth finalize（真 Stripe） | ✅ `20260913140000` — **I-H10** admin session finalize |
| carrier / inconclusive on resolve UI | ✅ **PR3B** (`DisputeDetailClient` + `carrierLiabilityParty`) |

詳表：[refund-policy §12](../../refund-policy.md#12-實作對照與缺口)

---

## 6. 相關文件

- [admin-grading/backend.md](../admin-grading/backend.md) — Grading fail RPC
- [admin-moderation/backend.md](./backend.md) — Phase H resolve
- [6phase-test-plan.md §1.6](./6phase-test-plan.md#16-退款政策-case-對照) — 自動化對照表
