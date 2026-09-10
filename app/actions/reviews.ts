"use server";

import { revalidatePath } from "next/cache";
import type {
  GetPublicProfileReviewsInput,
  GetPublicProfileReviewsResult,
  PublicProfileReviewItem,
  PublicProfileReviewsPage,
  ReviewPersona,
  ReviewSortKey,
} from "@/app/lib/reviews/types";
import { resolveAvatarUrl } from "@/lib/profile/avatar";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/supabase";

export type {
  GetPublicProfileReviewsInput,
  GetPublicProfileReviewsResult,
  PublicProfileReviewItem,
  PublicProfileReviewsPage,
  ReviewPersona,
  ReviewSortKey,
} from "@/app/lib/reviews/types";

const MAX_COMMENT_LENGTH = 200;

const PROFILE_ID_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EMPTY_REVIEWS_PAGE: PublicProfileReviewsPage = {
  reviews: [],
  aggregateRating: 0,
  publicReviewCount: 0,
  totalCount: 0,
  page: 1,
  pageSize: 10,
  totalPages: 0,
  rangeStart: 0,
  rangeEnd: 0,
};

type SearchPublicProfileReviewsRpcArgs = {
  p_profile_id: string;
  p_persona: ReviewPersona;
  p_sort: ReviewSortKey;
  p_page: number;
  p_page_size: number;
};

type SearchPublicProfileReviewsRpcRow = {
  review_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  is_merchant_tx: boolean;
  reviewer_id: string;
  reviewer_persona: ReviewPersona;
  reviewer_display_name: string;
  reviewer_username: string | null;
  reviewer_avatar_path: string | null;
  aggregate_rating: number | null;
  public_review_count: number;
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
  range_start: number;
  range_end: number;
};

function formatReviewDateLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return `${date.getFullYear()}年 ${date.getMonth() + 1}月`;
}

function mapPublicProfileReviewRow(
  row: SearchPublicProfileReviewsRpcRow,
): PublicProfileReviewItem {
  return {
    id: row.review_id,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.created_at,
    dateLabel: formatReviewDateLabel(row.created_at),
    isMerchantTx: row.is_merchant_tx,
    reviewerId: row.reviewer_id,
    reviewerPersona: row.reviewer_persona ?? "member",
    reviewerDisplayName: row.reviewer_display_name,
    reviewerUsername: row.reviewer_username,
    reviewerAvatarUrl: resolveAvatarUrl(row.reviewer_avatar_path),
  };
}

function mapPublicProfileReviewsPage(
  rows: SearchPublicProfileReviewsRpcRow[],
  page: number,
  pageSize: number,
): PublicProfileReviewsPage {
  if (rows.length === 0) {
    return { ...EMPTY_REVIEWS_PAGE, page, pageSize };
  }

  const head = rows[0];

  return {
    reviews: rows.map(mapPublicProfileReviewRow),
    aggregateRating: Number(head.aggregate_rating ?? 0),
    publicReviewCount: Number(head.public_review_count ?? 0),
    totalCount: Number(head.total_count ?? 0),
    page: head.page ?? page,
    pageSize: head.page_size ?? pageSize,
    totalPages: head.total_pages ?? 0,
    rangeStart: head.range_start ?? 0,
    rangeEnd: head.range_end ?? 0,
  };
}

type RpcSubmitTransactionReviewArgs = {
  p_order_id: string;
  p_reviewee_id: string;
  p_rating: number;
  p_comment: string | null;
  p_user_id: string;
};

export type SubmitTransactionReviewInput = {
  orderId: string;
  revieweeId: string;
  rating: number;
  comment?: string;
};

export type SubmitTransactionReviewResult =
  | { success: true; revealed: boolean }
  | { success: false; error: string };

export type GetUserReviewedMemberOrderIdsResult =
  | { success: true; data: string[] }
  | { success: false; error: string };

export type GetUserReviewedOrderIdsResult = GetUserReviewedMemberOrderIdsResult;

export type ResolveChatCompletionOrderIdInput = {
  messageId: string;
  roomId: string;
  revieweeId: string;
};

export type ResolveChatCompletionOrderIdResult =
  | { success: true; orderId: string | null }
  | { success: false; error: string };

type RpcSubmitTransactionReviewResult = {
  success?: boolean;
  review_id?: string;
  revealed?: boolean;
};

function parseRpcSubmitReviewPayload(
  data: unknown,
): RpcSubmitTransactionReviewResult | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  return data as RpcSubmitTransactionReviewResult;
}

function validateRating(rating: number): string | null {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return "請選擇 1 至 5 星評分";
  }
  return null;
}

function validateComment(comment: string | undefined): string | null {
  if (!comment) {
    return null;
  }
  const trimmed = comment.trim();
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    return `留言不可超過 ${MAX_COMMENT_LENGTH} 字`;
  }
  return null;
}

function pickChatMessageOrderId(
  row:
    | Pick<Tables<"chat_messages">, "member_order_id" | "merchant_order_id">
    | null
    | undefined,
): string | null {
  if (!row) {
    return null;
  }

  const merchantOrderId = row.merchant_order_id?.trim();
  if (merchantOrderId) {
    return merchantOrderId;
  }

  const memberOrderId = row.member_order_id?.trim();
  if (memberOrderId) {
    return memberOrderId;
  }

  return null;
}

export async function resolveChatCompletionOrderId(
  input: ResolveChatCompletionOrderIdInput,
): Promise<ResolveChatCompletionOrderIdResult> {
  const messageId = input.messageId.trim();
  const roomId = input.roomId.trim();
  const revieweeId = input.revieweeId.trim();

  if (!messageId || !roomId || !revieweeId) {
    return { success: true, orderId: null };
  }

  if (!isSupabaseConfigured()) {
    return { success: false, error: "未登入" };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "請先登入" };
    }

    const { data: messageData, error: messageError } = await supabase
      .from("chat_messages")
      .select("member_order_id, merchant_order_id, room_id, content")
      .eq("id", messageId)
      .maybeSingle();

    if (messageError) {
      console.error(
        "[resolveChatCompletionOrderId] message",
        messageError.message,
      );
      return { success: false, error: messageError.message };
    }

    const messageRow = messageData as Pick<
      Tables<"chat_messages">,
      "member_order_id" | "merchant_order_id" | "room_id" | "content"
    > | null;

    if (messageRow?.content === "SYSTEM_ORDER_COMPLETED") {
      const orderId = pickChatMessageOrderId(messageRow);
      if (orderId) {
        return { success: true, orderId };
      }
    }

    const { data: roomCompletionData, error: roomCompletionError } =
      await supabase
        .from("chat_messages")
        .select("id, member_order_id, merchant_order_id")
        .eq("room_id", roomId)
        .eq("content", "SYSTEM_ORDER_COMPLETED")
        .or("member_order_id.not.is.null,merchant_order_id.not.is.null")
        .order("created_at", { ascending: false });

    if (roomCompletionError) {
      console.error(
        "[resolveChatCompletionOrderId] room completion",
        roomCompletionError.message,
      );
      return { success: false, error: roomCompletionError.message };
    }

    const roomCompletionRows = (roomCompletionData ?? []) as Array<
      Pick<
        Tables<"chat_messages">,
        "id" | "member_order_id" | "merchant_order_id"
      >
    >;

    const roomCompletionMatch =
      roomCompletionRows.find((row) => row.id === messageId) ??
      roomCompletionRows[0];

    const roomCompletionOrderId = pickChatMessageOrderId(roomCompletionMatch);
    if (roomCompletionOrderId) {
      return { success: true, orderId: roomCompletionOrderId };
    }

    const { data: acceptedOfferData, error: acceptedOfferError } =
      await supabase
        .from("chat_messages")
        .select("member_order_id, merchant_order_id")
        .eq("room_id", roomId)
        .eq("content", "SYSTEM_OFFER_ACCEPTED")
        .or("member_order_id.not.is.null,merchant_order_id.not.is.null")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (acceptedOfferError) {
      console.error(
        "[resolveChatCompletionOrderId] accepted offer",
        acceptedOfferError.message,
      );
      return { success: false, error: acceptedOfferError.message };
    }

    const acceptedOfferOrderId = pickChatMessageOrderId(
      acceptedOfferData as Pick<
        Tables<"chat_messages">,
        "member_order_id" | "merchant_order_id"
      > | null,
    );
    if (acceptedOfferOrderId) {
      return { success: true, orderId: acceptedOfferOrderId };
    }

    const { data: merchantOrderData, error: merchantOrderError } =
      await supabase
        .from("merchant_orders")
        .select("id")
        .eq("buyer_id", user.id)
        .eq("merchant_id", revieweeId)
        .not("buyer_confirmed_at", "is", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (merchantOrderError) {
      console.error(
        "[resolveChatCompletionOrderId] merchant order",
        merchantOrderError.message,
      );
      return { success: false, error: merchantOrderError.message };
    }

    const merchantOrderRow = merchantOrderData as Pick<
      Tables<"merchant_orders">,
      "id"
    > | null;

    if (merchantOrderRow?.id) {
      return { success: true, orderId: merchantOrderRow.id };
    }

    const { data: orderData, error: orderError } = await supabase
      .from("member_orders")
      .select("id")
      .eq("status", "completed")
      .or(
        `and(buyer_id.eq.${user.id},seller_id.eq.${revieweeId}),and(buyer_id.eq.${revieweeId},seller_id.eq.${user.id})`,
      )
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (orderError) {
      console.error("[resolveChatCompletionOrderId] order", orderError.message);
      return { success: false, error: orderError.message };
    }

    const orderRow = orderData as Pick<Tables<"member_orders">, "id"> | null;

    return { success: true, orderId: orderRow?.id ?? null };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "無法解析訂單編號";
    console.error("[resolveChatCompletionOrderId]", error);
    return { success: false, error: message };
  }
}

export async function getPublicProfileReviews(
  input: GetPublicProfileReviewsInput,
): Promise<GetPublicProfileReviewsResult> {
  const profileId = input.profileId.trim();
  const persona = input.persona ?? "member";
  const sort = input.sort ?? "date-desc";
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, input.pageSize ?? 10));

  if (!profileId) {
    return { success: false, error: "找不到此用戶", notFound: true };
  }

  if (!PROFILE_ID_UUID_RE.test(profileId)) {
    return { success: false, error: "找不到此用戶", notFound: true };
  }

  if (!isSupabaseConfigured()) {
    return {
      success: true,
      data: { ...EMPTY_REVIEWS_PAGE, page, pageSize },
    };
  }

  try {
    const supabase = await createClient();

    const rpcArgs: SearchPublicProfileReviewsRpcArgs = {
      p_profile_id: profileId,
      p_persona: persona,
      p_sort: sort,
      p_page: page,
      p_page_size: pageSize,
    };

    const { data, error } = await (
      supabase as unknown as {
        rpc: (
          fn: "search_public_profile_reviews",
          args: SearchPublicProfileReviewsRpcArgs,
        ) => Promise<{
          data: SearchPublicProfileReviewsRpcRow[] | null;
          error: { message: string } | null;
        }>;
      }
    ).rpc("search_public_profile_reviews", rpcArgs);

    if (error) {
      console.error("[getPublicProfileReviews] rpc", error.message);
      return { success: false, error: "無法載入評價紀錄" };
    }

    const rows = (data ?? []) as SearchPublicProfileReviewsRpcRow[];

    if (rows.length === 0 && page === 1) {
      if (input.cachedAggregateRating !== undefined) {
        return {
          success: true,
          data: {
            ...EMPTY_REVIEWS_PAGE,
            aggregateRating: input.cachedAggregateRating,
            page,
            pageSize,
          },
        };
      }

      const { data: profileRow, error: profileError } = await supabase
        .from("profiles")
        .select("id, rating_score")
        .eq("id", profileId)
        .maybeSingle<Pick<Tables<"profiles">, "id" | "rating_score">>();

      if (profileError) {
        console.error("[getPublicProfileReviews] profile", profileError.message);
        return { success: false, error: "無法載入評價紀錄" };
      }

      if (!profileRow) {
        return { success: false, error: "找不到此用戶", notFound: true };
      }

      let aggregateRating = Number(profileRow.rating_score ?? 0);

      if (persona === "merchant") {
        const { data: shopRow } = await supabase
          .from("merchant_shops")
          .select("rating_score")
          .eq("merchant_id", profileId)
          .maybeSingle<Pick<Tables<"merchant_shops">, "rating_score">>();

        aggregateRating = Number(shopRow?.rating_score ?? 0);
      }

      return {
        success: true,
        data: {
          ...EMPTY_REVIEWS_PAGE,
          aggregateRating,
          page,
          pageSize,
        },
      };
    }

    return {
      success: true,
      data: mapPublicProfileReviewsPage(rows, page, pageSize),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "無法載入評價紀錄";
    console.error("[getPublicProfileReviews]", error);
    return { success: false, error: message };
  }
}

export async function getUserReviewedMemberOrderIds(
  orderIds: string[],
): Promise<GetUserReviewedMemberOrderIdsResult> {
  const normalizedIds = [
    ...new Set(orderIds.map((id) => id.trim()).filter(Boolean)),
  ];

  if (normalizedIds.length === 0) {
    return { success: true, data: [] };
  }

  if (!isSupabaseConfigured()) {
    return { success: false, error: "未登入" };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "請先登入" };
    }

    const { data, error } = await (
      supabase as unknown as {
        rpc: (
          fn: "rpc_get_user_reviewed_member_order_ids",
          args: { p_order_ids: string[] },
        ) => Promise<{
          data: string[] | null;
          error: { message: string } | null;
        }>;
      }
    ).rpc("rpc_get_user_reviewed_member_order_ids", {
      p_order_ids: normalizedIds,
    });

    if (error) {
      console.error("[getUserReviewedMemberOrderIds] rpc", error.message);
      return { success: false, error: error.message };
    }

    return { success: true, data: data ?? [] };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "無法查詢評價狀態";
    console.error("[getUserReviewedMemberOrderIds]", error);
    return { success: false, error: message };
  }
}

export async function getUserReviewedMerchantOrderIds(
  orderIds: string[],
): Promise<GetUserReviewedMemberOrderIdsResult> {
  const normalizedIds = [
    ...new Set(orderIds.map((id) => id.trim()).filter(Boolean)),
  ];

  if (normalizedIds.length === 0) {
    return { success: true, data: [] };
  }

  if (!isSupabaseConfigured()) {
    return { success: false, error: "未登入" };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "請先登入" };
    }

    const { data, error } = await (
      supabase as unknown as {
        rpc: (
          fn: "rpc_get_user_reviewed_merchant_order_ids",
          args: { p_order_ids: string[] },
        ) => Promise<{
          data: string[] | null;
          error: { message: string } | null;
        }>;
      }
    ).rpc("rpc_get_user_reviewed_merchant_order_ids", {
      p_order_ids: normalizedIds,
    });

    if (error) {
      console.error("[getUserReviewedMerchantOrderIds] rpc", error.message);
      return { success: false, error: error.message };
    }

    return { success: true, data: data ?? [] };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "無法查詢評價狀態";
    console.error("[getUserReviewedMerchantOrderIds]", error);
    return { success: false, error: message };
  }
}

export async function getUserReviewedOrderIds(
  orderIds: string[],
): Promise<GetUserReviewedOrderIdsResult> {
  const normalizedIds = [
    ...new Set(orderIds.map((id) => id.trim()).filter(Boolean)),
  ];

  if (normalizedIds.length === 0) {
    return { success: true, data: [] };
  }

  const [memberResult, merchantResult] = await Promise.all([
    getUserReviewedMemberOrderIds(normalizedIds),
    getUserReviewedMerchantOrderIds(normalizedIds),
  ]);

  if (!memberResult.success) {
    return memberResult;
  }

  if (!merchantResult.success) {
    return merchantResult;
  }

  return {
    success: true,
    data: [...new Set([...memberResult.data, ...merchantResult.data])],
  };
}

export async function submitTransactionReview(
  input: SubmitTransactionReviewInput,
): Promise<SubmitTransactionReviewResult> {
  const orderId = input.orderId.trim();
  const revieweeId = input.revieweeId.trim();

  if (!orderId) {
    return { success: false, error: "找不到此訂單" };
  }

  if (!revieweeId) {
    return { success: false, error: "找不到被評價對象" };
  }

  const ratingError = validateRating(input.rating);
  if (ratingError) {
    return { success: false, error: ratingError };
  }

  const commentError = validateComment(input.comment);
  if (commentError) {
    return { success: false, error: commentError };
  }

  if (!isSupabaseConfigured()) {
    return { success: false, error: "未登入" };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "請先登入後再提交評價" };
    }

    const rpcArgs: RpcSubmitTransactionReviewArgs = {
      p_order_id: orderId,
      p_reviewee_id: revieweeId,
      p_rating: input.rating,
      p_comment: input.comment?.trim() || null,
      p_user_id: user.id,
    };

    const { data, error } = await (
      supabase as unknown as {
        rpc: (
          fn: "rpc_submit_transaction_review",
          args: RpcSubmitTransactionReviewArgs,
        ) => Promise<{
          data: unknown;
          error: { message: string } | null;
        }>;
      }
    ).rpc("rpc_submit_transaction_review", rpcArgs);

    if (error) {
      console.error("[submitTransactionReview] rpc", error.message);
      return { success: false, error: error.message };
    }

    const parsed = parseRpcSubmitReviewPayload(data);
    if (!parsed?.success) {
      console.error("[submitTransactionReview] invalid rpc payload", data);
      return { success: false, error: "提交評價回傳資料格式異常" };
    }

    revalidatePath("/profile/user/trading");
    revalidatePath("/profile/merchant/trading");
    revalidatePath(`/profile/user/${revieweeId}`);
    revalidatePath(`/profile/merchant/${revieweeId}`);
    revalidatePath(`/profile/${revieweeId}`);
    revalidatePath(`/profile/${revieweeId}/rating`);

    return { success: true, revealed: parsed.revealed === true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "提交評價時發生錯誤";
    console.error("[submitTransactionReview]", error);
    return { success: false, error: message };
  }
}
