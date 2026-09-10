# Merchant KYC Flow — Backend Handoff

## Status

- **Backend:** ✅ Ready（申請 → 審批 → Stripe Connect 自動開通全鏈路）
- **Frontend:** 🟡 Admin 表格 UI 已還原；merchant Stripe CTA 樣式待精修（見 [frontend.md](./frontend.md)）

## 流程總覽

```
member 註冊/登入
  → /profile/user/merchant-apply 3 步 wizard（公司 → 代表人 → 4 份文件）
  → rpc_submit_merchant_kyc_application（atomic）:
      kyc_applications (pending) + kyc_documents
      + profiles.role → merchant（provisional）
      + kyc_records.kyc_status → pending
      + merchant_shops 初始化（L1 reputation_tag + shop_handle）
  → redirect /profile/merchant（dual persona switch 可用；禁止 merchant 上架）
  → admin /admin/merchants 審核（signed URL 睇文件）
  → approve pipeline:
      1. kyc_applications → approved
      2. kyc_records pending → verified（shop 已存在則 trigger skip）
      3. Stripe accounts.create（Express, HK, company — **不帶 external_account**）
      4. persons.create 代表人 + files.create 推 4 份文件
  → reject：profiles.role → member、kyc_records → rejected（shop 保留 audit）
  → merchant dashboard CTA → /api/stripe/connect/onboard → hosted onboarding
  → return /api/stripe/connect/return → sync kyc_records flags（webhook 備援）
  → webhook account.updated → stripe_charges_enabled / stripe_payouts_enabled
  → 完成 onboarding 後：/api/stripe/connect/dashboard → Stripe Express login link（平台代開，唔使 merchant 自行註冊 stripe.com）
```

### 功能 gate（三層）

| 階段 | 會員功能 | 商戶後台 | 商戶上架 | 收款 |
|------|---------|---------|---------|------|
| Submit 後 pending | 全開 | 可進 | **禁止** (`lib/kyc/merchant-gates.ts`) | **禁止** |
| Admin approve | 全開 | 全開 | 可開 (`kyc_status=verified`) | 禁止直至 Stripe |
| Stripe onboarding 完成 | 全開 | 全開 | 可開 | 可開 (`lib/stripe/payout-ready.ts`) |

公開店舖（`load-seller-profile.ts`）：`kyc_status !== verified` 時 merchant persona 回傳 `null`（notFound）。

出款銀行戶口 **唔再** 於申請表手填；平台 Connect transfer 只需 `stripe_account_id`，
merchant 於 Stripe hosted onboarding 綁定出款銀行。申請表仍須上傳 **公司銀行結單** 供 admin AML 審核。

Stripe 步驟失敗 **唔會 rollback** 平台審批；onboard route 有重試補建邏輯。

## 安全模型

- `kyc_applications` / `kyc_documents`：RLS enable 但 **零 policy**（client 全拒），
  所有讀寫經 server actions 以 `createAdminClient()`（service role）進行，action 層自行做 auth。
- **表級 GRANT**（`20260728120000` kyc_applications；`20260728130000` **kyc_records**）：
  `service_role` 需顯式 GRANT；`kyc_records` 另需 `anon`/`authenticated` SELECT + RLS policy 供 dashboard / storefront chip。
- Storage bucket `kyc-documents`：private、無 storage policy、10MB、只准 pdf/jpg/png/webp；
  路徑 `{userId}/{documentType}/{uuid}.{ext}`；提交時以 `isKycPathOwnedByUser` 防引用他人檔案。
- 敏感欄（`rep_hkid`、`bank_account_number`）永不回傳 client；手填銀行欄位已改 nullable 且不再收集。
- Admin 睇文件用 10 分鐘短時效 signed URL。
- Webhook 以 `STRIPE_WEBHOOK_SECRET` 驗簽；connect 就緒判定 fail-closed
  （`charges_enabled && payouts_enabled` 兩者皆 true）。

## Files

| File | Purpose |
|------|---------|
| `supabase/migrations/20260728100000_merchant_kyc_applications.sql` | 兩張表 + enum + RLS + bucket（自動建立） |
| `supabase/migrations/20260728110000_kyc_records_stripe_connect_flags.sql` | `stripe_charges_enabled` / `stripe_payouts_enabled` |
| `supabase/migrations/20260728120000_kyc_applications_grants_and_nullable_bank.sql` | GRANT service_role + 銀行欄位 nullable |
| `supabase/migrations/20260728130000_kyc_records_grants_and_merchant_init.sql` | **kyc_records GRANT/RLS** + `generate_merchant_shop_handle` + 開店 0.0 評分 |
| `supabase/migrations/20260728140000_rpc_submit_merchant_kyc_application.sql` | **原子提交 RPC**（application + 4 documents 單一 transaction） |
| `supabase/migrations/20260728150000_rpc_submit_provisional_merchant.sql` | RPC 擴展：submit 時 provisional merchant（role + kyc pending + shop） |
| `lib/kyc/merchant-gates.ts` | `isMerchantListingAllowed` — merchant 上架 gate |
| `lib/stripe/payout-ready.ts` | `isMerchantPayoutReady` — escrow 放款 gate（未來 transfer 必須 call） |
| `lib/stripe/account-summary.ts` | Admin 唯讀 Stripe 出款摘要（last4 + Dashboard link，唔落地 DB） |
| `lib/kyc/validation.ts` | 欄位契約 + `validateMerchantKycStep` / `validateMerchantKycFields` |
| `lib/kyc/documents.ts` | 文件類型常量 / labels / 檔案驗證（client-safe） |
| `lib/storage/kyc-documents.ts` | Storage 上傳 / signed URL / 下載 bytes（server-only） |
| `lib/stripe/connect-kyc.ts` | Express account + person + 文件同步（無 external_account prefill） |
| `app/api/kyc/upload-document/route.ts` | 文件上傳（登入 + 非 merchant） |
| `app/actions/merchant-kyc.ts` | `getMyKycApplication`, `submitMerchantKycApplication` |
| `app/actions/admin-kyc.ts` | `listKycApplications`, `getKycDocumentSignedUrl`, `reviewKycApplication` |
| `app/actions/auth.ts` | `registerMemberForMerchantApply`（註冊後直入申請頁） |
| `app/api/stripe/connect/onboard/route.ts` | onboarding link（含重試補建） |
| `app/api/stripe/connect/dashboard/route.ts` | Express login link（`accounts.createLoginLink`；未 payout-ready 則 redirect onboard） |
| `lib/stripe/connect-dashboard.ts` | `createMerchantExpressLoginLink` + `maskStripeAccountId` |
| `app/api/stripe/connect/return/route.ts` | onboarding return → `accounts.retrieve` sync flags |
| `lib/stripe/sync-kyc-connect-flags.ts` | webhook / return 共用 `kyc_records` flags 寫入 |
| `app/api/stripe/webhook/route.ts` | `account.updated` → connect flags |

## Action contracts

### `submitMerchantKycApplication` — `useActionState`

```ts
(prev: MerchantKycFormErrors | null, formData: FormData)
  => Promise<MerchantKycFormErrors | null>   // null = 成功
```

FormData `name` 屬性（大小寫敏感，SSOT = `lib/kyc/validation.ts`）：

- 公司：`companyNameEn` `companyNameZh`(opt) `brNumber` `companyAddressLine1` `companyAddressLine2`(opt) `companyPhone`
- 代表人：`repNameEn` `repNameZh`(opt) `repDob`(YYYY-MM-DD) `repHkid` `repAddressLine1` `repAddressLine2`(opt) `repEmail` `repPhone` `repTitle`
- 文件（hidden，值 = upload API 回傳 storagePath）：`docBrCertificate` `docBankStatement` `docRepIdFront` `docRepIdBack`

**唔再收集**：`bankName` `bankCode` `branchCode` `bankAccountNumber` `bankAccountHolder`（出款銀行改 Stripe onboarding）。

**完整性 gate**：公司 + 代表人必填欄位 + 4 份文件缺一不可（server 呼叫 `validateMerchantKycFields`）。
`rejected` 申請重交會 reset 返 `pending` 並覆蓋舊資料/文件記錄。Upsert 時 bank 欄位寫 `null`。

**原子提交（P1）**：action 驗證通過後呼叫 `rpc_submit_merchant_kyc_application`（`service_role`），
單一 DB transaction 寫入 `kyc_applications` + 4 行 `kyc_documents`；任一步失敗則全部 rollback。
Storage 仍維持選檔即傳（`POST /api/kyc/upload-document`），唔改 wizard UX。

```ts
rpc_submit_merchant_kyc_application(
  p_user_id: UUID,
  p_application: JSONB,  // 公司/代表人欄位
  p_documents: JSONB     // [{ document_type, storage_path, content_type }, ...] × 4
) => { application_id: UUID }
```

### `getMyKycApplication()`

```ts
{ success: true, data: MyKycApplication | null } | { success: false, error }
// MyKycApplication: { id, status, rejectReason, companyNameEn, companyNameZh,
//   brNumber, submittedAt, uploadedDocumentTypes }
```

### `POST /api/kyc/upload-document`

FormData：`documentType`（`br_certificate | bank_statement | rep_id_front | rep_id_back`）+ `document`（File）
→ `{ success: true, data: { storagePath, documentType, contentType } }`

### Admin actions（全部 fail-closed admin guard）

```ts
listKycApplications({ status? })            // AdminKycApplicationListItem[]（含 applicantUsername, shopHandle, documents, stripeAccountId）
getKycDocumentSignedUrl(documentId)         // { url }（10 分鐘）
getStripePayoutBankSummary(applicationId)    // 唯讀 Stripe 出款摘要（last4、charges/payouts flags、Dashboard URL）
reviewKycApplication(id, "approve" | "reject", rejectReason?)
retryKycProvisioning(applicationId)         // 已批准但 kyc_records/Stripe 缺失時重試
// approve：kyc_records upsert 失敗會 rollback（applications→pending, role→member）
// approve 成功：{ decision, stripeAccountId?, stripeSyncWarning? }
// getStripePayoutBankSummary：唔 sync 銀行資料入 DB；僅 on-demand call Stripe API
```

## Env

| Var | 用途 |
|-----|------|
| `STRIPE_SECRET_KEY` | 已有（`lib/stripe.ts`） |
| `STRIPE_WEBHOOK_SECRET` | **新增** — Stripe dashboard webhook endpoint signing secret |
| `NEXT_PUBLIC_SITE_URL` | onboarding return/refresh URL（無設定時 fallback request host） |
| `SUPABASE_SERVICE_ROLE_KEY` | 已有（admin client + storage）；必須為 Dashboard → API → **service_role** secret |

## Migrations

已 push remote（`bunx supabase db push` ✅），types 已重生（含 `20260728140000` atomic submit RPC）。

## How to verify (backend)

1. 未登入訪問 `/profile/user/merchant-apply` → redirect `/auth?role=merchant`。
2. 註冊時剔「登記成為商戶」→ 建立帳戶後直入申請頁；`getMyKycApplication` 唔再 `permission denied`。
3. Wizard Step 1/2 驗證通過先可進下一步；Step 3 上傳 4 份文件後提交 → `kyc_applications` 一行 `pending`。
4. Admin 登入 `/admin/merchants` → 待審核 tab 見申請 → 文件按鈕開 signed URL（無「收款戶口」手填欄位）。
5. 批准 → `profiles.role = merchant`、`kyc_records.kyc_status = verified`、
   `merchant_shops` 自動有行、`kyc_records.stripe_account_id = acct_...`、
   Stripe dashboard 見 Express account（**無** prefilled external_account）。
6. Merchant dashboard CTA → hosted onboarding → merchant 填出款銀行。
7. 完成 onboarding → webhook 後 `stripe_charges_enabled` / `stripe_payouts_enabled` 變 true。
8. Payout-ready merchant → `GET /api/stripe/connect/dashboard` → redirect Stripe Express Dashboard（login link，非 stripe.com 自行登入）。
9. 拒絕（填原因）→ 申請人重訪申請頁見原因 + 可重交。
10. Admin 已批准且有 `acct_...` →「Stripe 出款」popover lazy-load → 顯示 bank last4 或「尚未綁定」+ Dashboard 連結。

```sql
SELECT a.status, a.company_name_en, p.role, k.kyc_status, k.stripe_account_id,
       k.stripe_charges_enabled, k.stripe_payouts_enabled
FROM kyc_applications a
JOIN profiles p ON p.id = a.user_id
LEFT JOIN kyc_records k ON k.merchant_id = a.user_id
WHERE a.user_id = '<uuid>';
```

## 後續（out of scope）

- 敏感欄 DB 加密（Supabase Vault / pgsodium）— 現以 RLS 全拒 + service role 屏蔽
- Email 通知審批結果
- Admin audit_log
- Transfer / payout 交易邏輯（用 `stripe_charges_enabled && stripe_payouts_enabled` 做 gate）
