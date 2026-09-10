"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Inbox, Megaphone } from "lucide-react";
import { HeaderBreadcrumbNav } from "@/app/components/navigation/HeaderBreadcrumbNav";
import { BrandWordmark } from "@/app/components/branding/BrandWordmark";
import { useHkCardVaultStore } from "@/app/store/useHkCardVaultStore";
import { useUIStore } from "@/app/store/useUIStore";
import { isChatRoomId } from "@/app/lib/chat/constants";
import { ChatUnreadDot } from "@/app/components/chat/ChatUnreadDot";
import { filterChatRoomsForViewerPersona } from "@/app/lib/chat/filter-rooms-for-viewer-persona";
import { useHasActiveAnnouncements } from "@/lib/announcements/use-has-active-announcements";
import { getHeaderBreadcrumb } from "@/lib/navigation/header-breadcrumb";

export function MobileHeader() {
  const pathname = usePathname();
  const breadcrumb = getHeaderBreadcrumb(pathname);
  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const hasActiveAnnouncements = useHasActiveAnnouncements();

  // 🟢 從 Zustand 引流狀態
  const {
    chats,
    setIsChatOpen,
    setMobileView,
    activateRoomById,
    openChatWithPartner,
  } = useHkCardVaultStore();

  // 廣播接收監聽器 ➔ 自動同步至狀態大腦
  useEffect(() => {
    const handleGlobalOpenChat = (e: Event) => {
      const customEvent = e as CustomEvent<{
        partnerId?: string;
        partnerName?: string;
        partnerPersona?: "member" | "merchant";
        roomId?: string;
      }>;
      const detail = customEvent.detail;
      if (detail?.roomId) {
        activateRoomById(
          detail.roomId,
          detail.partnerName || "\u672a\u77e5\u540d\u5546\u6236",
          detail.partnerId,
        );
        setMobileView("CHAT");
        return;
      }
      if (detail?.partnerId) {
        openChatWithPartner(
          detail.partnerId,
          detail.partnerName || "\u672a\u77e5\u540d\u5546\u6236",
          detail.partnerPersona ?? "member",
        );
        setMobileView("CHAT");
      }
    };

    window.addEventListener("open-global-chat", handleGlobalOpenChat);
    return () =>
      window.removeEventListener("open-global-chat", handleGlobalOpenChat);
  }, [activateRoomById, openChatWithPartner, setMobileView]);

  const userAuthRole = useUIStore((state) => state.userAuthRole);
  const activeListingPersona = useUIStore((state) => state.activeListingPersona);
  const isGuest = userAuthRole === "GUEST";

  const personaChats = filterChatRoomsForViewerPersona(
    chats,
    activeListingPersona,
  );

  const totalUnread = isGuest
    ? 0
    : personaChats
        .filter((room) => !isChatRoomId(room.id))
        .reduce((acc, curr) => acc + curr.unreadCount, 0);

  if (!isMounted) {
    return (
      <div className="lg:hidden h-12 border-b border-white/[0.08] bg-bg-page/90" />
    );
  }

  const iconButtonClass =
    "relative flex size-8 items-center justify-center rounded-lg border border-white/10 text-text-secondary transition-colors hover:border-brand/30 hover:bg-brand/10 hover:text-brand active:scale-[0.98]";

  return (
    <>
      <header className="lg:hidden sticky top-0 z-50 w-full h-12 border-b border-white/[0.08] bg-bg-page/90 backdrop-blur-sm">
        <div className="h-full px-4 flex items-center justify-between gap-3">
          {breadcrumb ? (
            <HeaderBreadcrumbNav breadcrumb={breadcrumb} compact />
          ) : (
            <Link
              href="/"
              className="flex min-w-0 items-center gap-2.5 active:scale-[0.98]"
            >
              <Image
                src="/asset/logo.png"
                alt="HKCardVault"
                height={32}
                width={32}
                className="size-8 shrink-0 rounded-lg border border-white/10 object-cover"
              />
              <BrandWordmark className="truncate text-[15px]" />
            </Link>
          )}

          <div className="flex shrink-0 items-center gap-1.5">
            <Link
              href="/announcements"
              title="官方公告"
              className={iconButtonClass}
            >
              <Megaphone className="size-4" aria-hidden="true" />
              {hasActiveAnnouncements ? (
                <span className="absolute top-1.5 right-1.5 flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-brand" />
                </span>
              ) : null}
            </Link>

            <button
              type="button"
              onClick={() => {
                setMobileView("LIST");
                setIsChatOpen(true);
              }}
              className={iconButtonClass}
              aria-label="開啟訊息收件匣"
            >
              <Inbox className="size-4" aria-hidden="true" />
              {totalUnread > 0 ? <ChatUnreadDot /> : null}
            </button>
          </div>
        </div>
      </header>
    </>
  );
}
