# Profile DM chat — frontend

## Touchpoints

- `app/components/chat/GlobalChatOverlay.tsx` — provision on pending room open
- `app/store/useHkCardVaultStore.ts` — `promotePendingChatRoom`
- `app/components/chat/GlobalChatConsole.tsx` — `isProvisioningRoom` placeholder

## Acceptance

- [ ] Logged-in user: profile「聯絡會員」→ placeholder「正在建立對話…」→「回覆給 …」→ send enabled
- [ ] Guest: toast「請先登入後再開啟對話」
- [ ] Username-only new chat (non-UUID) still blocked with toast
- [ ] Existing offer room reused (no duplicate thread)
