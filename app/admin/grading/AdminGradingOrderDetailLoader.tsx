"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import {
  getAdminGradingOrder,
  type AdminGradingOrderKind,
  type AdminGradingQueueRow,
} from "@/app/actions/admin-grading";
import { AdminGradingOrderDetailClient } from "@/app/admin/grading/AdminGradingOrderDetailClient";
import type { AdminGradingTab } from "@/lib/admin-grading/tabs";
import { readStashedAdminGradingDetailRow } from "@/lib/admin-grading/detail-cache";

type AdminGradingOrderDetailLoaderProps = {
  orderKind: AdminGradingOrderKind;
  orderId: string;
  initialRow: AdminGradingQueueRow | null;
  tab: AdminGradingTab;
  backHref: string;
};

export function AdminGradingOrderDetailLoader({
  orderKind,
  orderId,
  initialRow,
  tab,
  backHref,
}: AdminGradingOrderDetailLoaderProps) {
  const [row, setRow] = useState<AdminGradingQueueRow | null>(
    () => initialRow ?? readStashedAdminGradingDetailRow(orderKind, orderId),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (row) {
      return;
    }

    startTransition(async () => {
      const result = await getAdminGradingOrder({ orderKind, orderId });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setRow(result.data);
    });
  }, [orderId, orderKind, row]);

  if (row) {
    return (
      <AdminGradingOrderDetailClient
        initialRow={row}
        tab={tab}
        backHref={backHref}
      />
    );
  }

  if (isPending) {
    return (
      <p className="font-sans text-[13px] text-text-secondary">載入鑑定訂單…</p>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-3 rounded-xl border border-white/[0.08] bg-bg-page p-6">
      <p className="font-sans text-[14px] text-text-primary">
        {error ?? "找不到此鑑定訂單"}
      </p>
      <Link
        href={backHref}
        className="inline-flex font-sans text-[13px] text-brand hover:underline"
      >
        返回鑑定工作台
      </Link>
    </div>
  );
}
