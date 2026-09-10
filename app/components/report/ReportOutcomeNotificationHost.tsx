"use client";

import { useCallback, useEffect, useState } from "react";
import {
  acknowledgeReportOutcomes,
  getUnacknowledgedReportOutcomes,
} from "@/app/actions/reports";
import { useReportOutcomeNotificationStore } from "@/app/store/useReportOutcomeNotificationStore";
import { useCurrentUserId } from "@/app/lib/hooks/useCurrentUserId";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function ReportOutcomeNotificationHost() {
  const userId = useCurrentUserId();
  const queue = useReportOutcomeNotificationStore((state) => state.queue);
  const isOpen = useReportOutcomeNotificationStore((state) => state.isOpen);
  const enqueue = useReportOutcomeNotificationStore((state) => state.enqueue);
  const close = useReportOutcomeNotificationStore((state) => state.close);
  const clearQueue = useReportOutcomeNotificationStore((state) => state.clearQueue);
  const [isAcknowledging, setIsAcknowledging] = useState(false);

  const refreshPending = useCallback(async () => {
    if (!userId) {
      return;
    }

    const result = await getUnacknowledgedReportOutcomes();
    if (result.success && result.data.length > 0) {
      enqueue(result.data);
    }
  }, [enqueue, userId]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    let cancelled = false;

    const schedule = () => {
      if (cancelled) {
        return;
      }
      void refreshPending();
    };

    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(schedule, { timeout: 2000 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(id);
      };
    }

    const timer = window.setTimeout(schedule, 1500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [refreshPending, userId]);

  const handleClose = useCallback(async () => {
    if (queue.length === 0) {
      close();
      return;
    }

    setIsAcknowledging(true);
    const result = await acknowledgeReportOutcomes(
      queue.map((item) => item.reportId),
    );
    setIsAcknowledging(false);

    if (result.success) {
      clearQueue();
      return;
    }

    close();
  }, [clearQueue, close, queue]);

  if (!userId) {
    return null;
  }

  return (
    <AlertDialog open={isOpen && queue.length > 0} onOpenChange={() => void handleClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>舉報結果通知</AlertDialogTitle>
          <AlertDialogDescription className="space-y-3 pt-1">
            {queue.map((item) => (
              <div
                key={item.reportId}
                className="rounded-lg border border-border/60 bg-muted/30 p-3 text-left"
              >
                <p className="font-mono text-[11px] text-muted-foreground">
                  {item.caseNumber}
                </p>
                <p className="mt-1 text-sm text-foreground">{item.message}</p>
              </div>
            ))}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction
            disabled={isAcknowledging}
            onClick={() => void handleClose()}
          >
            {isAcknowledging ? "處理中…" : "我知道了"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
