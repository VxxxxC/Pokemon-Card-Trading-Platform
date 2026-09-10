-- Payment Milestone 1：新增 `pending_payment` 託管前置狀態。
--
-- 訂單成立（接受出價 / 立即購買）後先入 `pending_payment`，買家於 checkout
-- 完成 Stripe 付款、webhook 收到 payment_intent.succeeded 才轉 `payment_held`。
--
-- 注意：PostgreSQL 不允許在同一 transaction 內新增並使用 enum 值，
-- 因此本檔只加值，實際使用（欄位 / RPC）留在下一個 migration。

ALTER TYPE public.escrow_state ADD VALUE IF NOT EXISTS 'pending_payment' BEFORE 'payment_held';
