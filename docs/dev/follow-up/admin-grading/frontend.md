# Admin grading workbench — frontend

> **Status:** 🟡 Partner QA  
> **Partner QA：** [PARTNER_HANDOFF.md](./PARTNER_HANDOFF.md)（multicapture E2E 主流程 + 短訊版）

## UI touchpoints

| File | Work |
|------|------|
| `app/admin/grading/page.tsx` | SSR admin guard + initial queue fetch |
| `app/admin/grading/AdminGradingClient.tsx` | Tabs, filters, table, detail modal, mutations |
| `app/components/admin/AdminSidebar.tsx` | 「鑑定工作台」nav entry |
| `app/components/merchant/MerchantOrderDetailView.tsx` | Existing inbound tracking buttons call live `submitMerchantLogistics` |

## Actions to use

Import from `@/app/actions/admin-grading`:

- `searchAdminGradingOrders`
- `adminConfirmGradingIntake`
- `adminPassGrading`
- `adminFailGradingAndRefund`
- `adminSubmitGradingOutbound`
- `getAdminGradingAuditHistory`

## Acceptance checklist

- [ ] Admin (`profiles.role=admin`) can open `/admin/grading`; non-admin redirected
- [ ] Tabs filter queue: 待入庫 / 鑑定中 / 待出庫 / 已結案
- [ ] Member vs Merchant filter + keyword search + pagination
- [ ] Detail modal: confirm intake, pass with **grading** select (PSA/BGS/CGC/ARS/OTHER — not 裸卡) + goods capture, fail with **fault_party** select + void preview, outbound tracking
- [ ] Pass defaults grading from seller listing when graded (non-RAW); otherwise PSA 10
- [ ] After pass, detail shows platform `auth_grading_company` / `auth_grading_score`
- [ ] Mutations toast success/error; list refreshes on success
- [ ] Merchant auth order: seller can submit inbound tracking on order detail (paid + auth) — `canSubmitLogistics` shows inbound input at `payment_held`; hides「確認訂單並移交保管」
- [ ] CI: page safe when Supabase env unset (`isSupabaseConfigured` guard)

## Styling

Baseline functional UI shipped. Frontend dev may refine layout/spacing within admin design language without changing action contracts.
