import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

type MemberOrderRow = Database["public"]["Tables"]["member_orders"]["Row"];

export type MemberAuthMockFlowStep =
  | "mock_pay"
  | "inbound_tracking"
  | "platform_received"
  | "grading_pass"
  | "outbound_tracking"
  | "buyer_received";

export type MemberAuthMockFlowResult = {
  orderId: string;
  stepsRun: MemberAuthMockFlowStep[];
  finalEscrowStatus: MemberOrderRow["escrow_status"];
  finalStatus: MemberOrderRow["status"];
};

async function fetchAuthOrder(
  admin: SupabaseClient<Database>,
  orderId: string,
): Promise<MemberOrderRow> {
  const { data, error } = await admin
    .from("member_orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("找不到此訂單");
  }

  if (!data.use_authentication) {
    throw new Error("此訂單非鑑定託管單，無法跑 Mock 流程");
  }

  if (data.status === "completed" || data.status === "cancelled") {
    throw new Error("訂單已結束，無需推進");
  }

  return data;
}

/**
 * Dev-only: advance a member auth order from current escrow step through to completed.
 * Uses service role — bypasses buyer/seller session checks.
 */
export async function runMemberAuthMockFlowDev(
  admin: SupabaseClient<Database>,
  orderId: string,
): Promise<MemberAuthMockFlowResult> {
  const stepsRun: MemberAuthMockFlowStep[] = [];
  let order = await fetchAuthOrder(admin, orderId);

  if (
    order.escrow_status === "payment" ||
    (order.escrow_status === null && order.status === "pending")
  ) {
    const { error } = await admin
      .from("member_orders")
      .update({
        escrow_status: "custody",
        payment_confirmed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .eq("use_authentication", true)
      .eq("status", "pending");

    if (error) {
      throw new Error(`mock_pay: ${error.message}`);
    }

    stepsRun.push("mock_pay");
    order = await fetchAuthOrder(admin, orderId);
  }

  if (order.escrow_status === "custody") {
    if (!order.inbound_tracking_no?.trim()) {
      const { error } = await admin
        .from("member_orders")
        .update({
          inbound_tracking_no: `SF-MOCK-IN-${orderId.slice(0, 8).toUpperCase()}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);

      if (error) {
        throw new Error(`inbound_tracking: ${error.message}`);
      }

      stepsRun.push("inbound_tracking");
      order = await fetchAuthOrder(admin, orderId);
    }

    const { error } = await admin.rpc("rpc_confirm_platform_received", {
      p_order_id: orderId,
    });

    if (error) {
      throw new Error(`platform_received: ${error.message}`);
    }

    stepsRun.push("platform_received");
    order = await fetchAuthOrder(admin, orderId);
  }

  if (order.escrow_status === "grading") {
    const { error } = await admin.rpc("rpc_complete_member_auth_grading", {
      p_order_id: orderId,
    });

    if (error) {
      throw new Error(`grading_pass: ${error.message}`);
    }

    stepsRun.push("grading_pass");
    order = await fetchAuthOrder(admin, orderId);
  }

  if (order.escrow_status === "shipped") {
    if (!order.outbound_tracking_no?.trim()) {
      const { error } = await admin.rpc("rpc_submit_outbound_tracking", {
        p_order_id: orderId,
        p_tracking_no: `SF-MOCK-OUT-${orderId.slice(0, 8).toUpperCase()}`,
      });

      if (error) {
        throw new Error(`outbound_tracking: ${error.message}`);
      }

      stepsRun.push("outbound_tracking");
      order = await fetchAuthOrder(admin, orderId);
    }

    const listingId = order.listing_id;
    const { error } = await admin
      .from("member_orders")
      .update({
        escrow_status: "released",
        status: "completed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .eq("escrow_status", "shipped");

    if (error) {
      throw new Error(`buyer_received: ${error.message}`);
    }

    const { error: listingError } = await admin
      .from("listings")
      .update({ status: "sold" })
      .eq("id", listingId);

    if (listingError) {
      throw new Error(`buyer_received listing: ${listingError.message}`);
    }

    stepsRun.push("buyer_received");

    return {
      orderId,
      stepsRun,
      finalEscrowStatus: "released",
      finalStatus: "completed",
    };
  }

  return {
    orderId,
    stepsRun,
    finalEscrowStatus: order.escrow_status,
    finalStatus: order.status,
  };
}

export async function findLatestOpenAuthOrderId(
  admin: SupabaseClient<Database>,
): Promise<string | null> {
  const { data, error } = await admin
    .from("member_orders")
    .select("id")
    .eq("use_authentication", true)
    .eq("status", "pending")
    .in("escrow_status", ["payment", "custody", "grading", "shipped"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.id ?? null;
}
