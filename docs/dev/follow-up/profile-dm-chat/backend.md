# Profile DM chat — backend

## Migration

- `supabase/migrations/20261005130000_rpc_ensure_chat_room.sql`
- RPC: `rpc_ensure_chat_room(p_partner_id, p_partner_persona, p_viewer_persona)`
- Returns lobby-shaped room JSON with `fn_chat_party_profile_snippet` buyer/seller embeds.

## Server action

- `ensureChatRoom()` in `app/actions/chat.ts`
- Requires authenticated user + UUID `partnerId`

## Verify

```bash
bunx supabase db push
# as logged-in user in SQL editor:
# select rpc_ensure_chat_room('<partner-uuid>'::uuid, 'member', 'member');
```
