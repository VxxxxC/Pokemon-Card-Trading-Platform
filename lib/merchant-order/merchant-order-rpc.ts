import { isMerchantOrderBuyerConfirmed } from "@/lib/merchant-order/display-status";
import type { createClient } from "@/lib/supabase/server";
import type { Database, Tables } from "@/types/supabase";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type RpcPrepareMerchantOrderPayoutArgs = {
  p_order_id: string;
};

export type RpcConfirmMerchantBuyerReceiptArgs = {
  p_order_id: string;
};

export type RpcCancelMerchantAuthOrderArgs =
  Database["public"]["Functions"]["rpc_cancel_merchant_auth_order"]["Args"];

type RpcResult = {
  data: unknown;
  error: { message: string } | null;
};

type TypedRpcClient = {
  rpc(
    fn: "rpc_prepare_merchant_order_payout",
    args: RpcPrepareMerchantOrderPayoutArgs,
  ): Promise<RpcResult>;
  rpc(
    fn: "rpc_confirm_merchant_buyer_receipt",
    args: RpcConfirmMerchantBuyerReceiptArgs,
  ): Promise<RpcResult>;
  rpc(
    fn: "rpc_cancel_merchant_auth_order",
    args: RpcCancelMerchantAuthOrderArgs,
  ): Promise<RpcResult>;
};

function asTypedRpcClient(supabase: ServerSupabaseClient): TypedRpcClient {
  return supabase as unknown as TypedRpcClient;
}

export async function rpcPrepareMerchantOrderPayout(
  supabase: ServerSupabaseClient,
  args: RpcPrepareMerchantOrderPayoutArgs,
): Promise<RpcResult> {
  return asTypedRpcClient(supabase).rpc(
    "rpc_prepare_merchant_order_payout",
    args,
  );
}

export async function rpcConfirmMerchantBuyerReceipt(
  supabase: ServerSupabaseClient,
  args: RpcConfirmMerchantBuyerReceiptArgs,
): Promise<RpcResult> {
  return asTypedRpcClient(supabase).rpc(
    "rpc_confirm_merchant_buyer_receipt",
    args,
  );
}

export async function rpcCancelMerchantAuthOrder(
  supabase: ServerSupabaseClient,
  args: RpcCancelMerchantAuthOrderArgs,
): Promise<RpcResult> {
  return asTypedRpcClient(supabase).rpc("rpc_cancel_merchant_auth_order", args);
}

export function mapMerchantEscrowToMemberStatus(
  escrowStatus: Tables<"merchant_orders">["escrow_status"],
  buyerConfirmedAt?: string | null,
): Tables<"member_orders">["status"] {
  if (isMerchantOrderBuyerConfirmed({ buyerConfirmedAt })) {
    return "completed";
  }

  switch (escrowStatus) {
    case "completed_and_transferred":
      return "completed";
    case "refunded":
      return "cancelled";
    default:
      return "pending";
  }
}

export function isOpenMerchantBuyerOrder(
  escrowStatus: Tables<"merchant_orders">["escrow_status"],
): boolean {
  return (
    escrowStatus === "pending_payment" ||
    escrowStatus === "payment_held" ||
    escrowStatus === "shipped" ||
    escrowStatus === "authenticating" ||
    escrowStatus === "authenticated"
  );
}
