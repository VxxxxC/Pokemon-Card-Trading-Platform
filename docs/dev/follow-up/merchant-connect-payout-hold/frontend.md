# Merchant Connect T+7 Hold — Frontend

## UI touchpoints

| 檔案 | 變更 |
|------|------|
| `MemberOrderDetailView.tsx` | 買家確認後顯示撥款保留（T+7）；timeline 傳 `merchantPayoutStatus` |
| `MerchantOrderDetailView.tsx` | `held` 狀態、預計撥款時間；Transfer ID「待 T+7 後撥款」 |
| `MerchantB2cDirectTimeline.tsx` + `order-timeline-steps.ts` | held / buyer_confirmed 步驟 |
| `map-sale-order.ts` | `payout_status=held` → badge「款項保留中」 |
| `MerchantFinanceClient.tsx` + `merchant-finance.ts` | 列出 held 訂單與 `payout_hold_until` |
| `MerchantConnectLedgerTab.tsx` | `held` / `frozen` filter labels（ledger 仍只顯示已有 transfer 的列） |

## Copy reference

- 買家：`款項保留於平台，預計於 {date} 撥至商戶`
- 商戶：`款項保留中（T+7）`；Transfer placeholder：`待 T+7 後撥款`
- Timeline hold step：`T+7 售後期滿後撥至 Connect`

## Acceptance

- [ ] 買家確認後無重複 confirm CTA
- [ ] 商戶訂單詳情顯示 hold 狀態與預計撥款時間
- [ ] Finance 近期記錄含 held 列（無 Transfer ID）
- [ ] Transfer 完成後 timeline / badge 回到「已完成」
- [ ] Partner 重測：確認後 **不** 即時見 transfer ID（需等 T+7 或手動 backdate + cron）
