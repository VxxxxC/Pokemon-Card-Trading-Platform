"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getActiveAnnouncementsForDisplay } from "@/app/actions/admin-announcements";
import {
  ANNOUNCEMENT_READ_STATE_EVENT,
  hasUnreadAnnouncements,
} from "@/lib/announcements/read-state";

/** Nav megaphone dot — true when at least one active announcement is unread. */
export function useHasActiveAnnouncements(): boolean {
  const pathname = usePathname();
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      const result = await getActiveAnnouncementsForDisplay();
      if (cancelled || !result.success) {
        return;
      }

      setHasUnread(hasUnreadAnnouncements(result.data));
    };

    void sync();

    const onReadStateChange = () => {
      void sync();
    };

    window.addEventListener(ANNOUNCEMENT_READ_STATE_EVENT, onReadStateChange);
    return () => {
      cancelled = true;
      window.removeEventListener(
        ANNOUNCEMENT_READ_STATE_EVENT,
        onReadStateChange,
      );
    };
  }, [pathname]);

  return hasUnread;
}
