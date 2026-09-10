"use client";

import { create } from "zustand";
import type { ReportOutcomeNotification } from "@/lib/moderation/types";

type ReportOutcomeNotificationState = {
  queue: ReportOutcomeNotification[];
  isOpen: boolean;
  enqueue: (items: ReportOutcomeNotification[]) => void;
  setQueue: (items: ReportOutcomeNotification[]) => void;
  open: () => void;
  close: () => void;
  clearQueue: () => void;
};

export const useReportOutcomeNotificationStore =
  create<ReportOutcomeNotificationState>((set, get) => ({
    queue: [],
    isOpen: false,
    enqueue: (items) => {
      if (items.length === 0) {
        return;
      }
      const existing = new Set(get().queue.map((item) => item.reportId));
      const merged = [
        ...get().queue,
        ...items.filter((item) => !existing.has(item.reportId)),
      ];
      set({ queue: merged, isOpen: true });
    },
    setQueue: (items) => {
      set({ queue: items, isOpen: items.length > 0 });
    },
    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),
    clearQueue: () => set({ queue: [], isOpen: false }),
  }));
