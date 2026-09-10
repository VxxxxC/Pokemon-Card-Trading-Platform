"use client";

import React, { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  getUserOrderDetail,
  type MemberOrderDetail,
} from "@/app/actions/orders";
import { ReviewModal } from "@/app/components/trading/ReviewModal";
import { MemberOrderDetailView } from "@/app/components/user/MemberOrderDetailView";

type ActiveReviewState = {
  orderId: string;
  revieweeId: string;
} | null;

export default function UserOrderDetailPage() {
  const params = useParams();
  const orderId = typeof params.id === "string" ? params.id : "";
  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const [order, setOrder] = useState<MemberOrderDetail | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadedOrderId, setLoadedOrderId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeReview, setActiveReview] = useState<ActiveReviewState>(null);

  const loadOrder = useCallback(async () => {
    if (!orderId) {
      setFetchError("找不到此訂單");
      setOrder(null);
      setLoadedOrderId(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const result = await getUserOrderDetail(orderId);
    setIsLoading(false);

    if (!result.success) {
      setOrder(null);
      setLoadedOrderId(null);
      setFetchError(result.error);
      return;
    }

    setOrder(result.data);
    setLoadedOrderId(orderId);
    setFetchError(null);
  }, [orderId]);

  useEffect(() => {
    if (!isMounted) {
      return;
    }

    const timer = window.setTimeout(() => {
      void loadOrder();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [isMounted, loadOrder, refreshKey]);

  const handleRefresh = useCallback(() => {
    setRefreshKey((key) => key + 1);
  }, []);

  const handleOpenReview = useCallback(
    (reviewOrderId: string, revieweeId: string) => {
      setActiveReview({ orderId: reviewOrderId, revieweeId });
    },
    [],
  );

  const handleCloseReview = useCallback(() => {
    setActiveReview(null);
    handleRefresh();
  }, [handleRefresh]);

  const isOrderReady = Boolean(order) && loadedOrderId === orderId;

  if (!isMounted || isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-9 h-9 rounded-full border-2 border-brand border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isOrderReady) {
    if (fetchError) {
      return (
        <div className="py-16 text-center space-y-4">
          <p className="font-sans text-[14px] text-text-disabled">{fetchError}</p>
          <Link
            href="/profile/user/trading"
            className="font-sans text-[13px] font-bold text-brand hover:underline"
          >
            返回交易管理
          </Link>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-9 h-9 rounded-full border-2 border-brand border-t-transparent animate-spin" />
      </div>
    );
  }

  if (fetchError || !order) {
    return (
      <div className="py-16 text-center space-y-4">
        <p className="font-sans text-[14px] text-text-disabled">
          {fetchError ?? "找不到指定的交易訂單記錄。"}
        </p>
        <Link
          href="/profile/user/trading"
          className="font-sans text-[13px] font-bold text-brand hover:underline"
        >
          返回交易管理
        </Link>
      </div>
    );
  }

  return (
    <>
      <MemberOrderDetailView
        order={order}
        onRefresh={handleRefresh}
        onOpenReview={handleOpenReview}
      />
      {activeReview && (
        <ReviewModal
          isOpen
          orderId={activeReview.orderId}
          revieweeId={activeReview.revieweeId}
          onClose={handleCloseReview}
        />
      )}
    </>
  );
}
