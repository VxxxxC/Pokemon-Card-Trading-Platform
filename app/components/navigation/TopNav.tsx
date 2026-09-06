"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Megaphone } from "lucide-react";
import { useHkCardVaultStore } from "@/app/store/useHkCardVaultStore";
import { useUIStore } from "@/app/store/useUIStore";
import { getProfileHomePath } from "@/lib/auth/roles";
import { isChatRoomId } from "@/app/lib/chat/constants";
import { filterChatRoomsForViewerPersona } from "@/app/lib/chat/filter-rooms-for-viewer-persona";
import { useHasActiveAnnouncements } from "@/lib/announcements/use-has-active-announcements";
import {
  ChatUnreadDot,
  ChatUnreadDotInline,
} from "@/app/components/chat/ChatUnreadDot";
import { HeaderBreadcrumbNav } from "@/app/components/navigation/HeaderBreadcrumbNav";
import { BrandWordmark } from "@/app/components/branding/BrandWordmark";
import { getHeaderBreadcrumb } from "@/lib/navigation/header-breadcrumb";

const baseNavLinks = [
  { href: "/", label: "首頁" },
  { href: "/marketplace", label: "市場" },
] as const;

export function TopNav() {
  const pathname = usePathname();
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const openAddAssetModal = useUIStore((state) => state.openAddAssetModal);
  // 🟢 注入全域 userAuthRole 身份真理源
  const userAuthRole = useUIStore((state) => state.userAuthRole);
  const activeListingPersona = useUIStore((state) => state.activeListingPersona);

  const isGuest = userAuthRole === "GUEST";
  const profileHomeHref = isGuest
    ? "/auth"
    : getProfileHomePath(userAuthRole, activeListingPersona);
  const navLinks = [
    ...baseNavLinks,
    { href: profileHomeHref, label: "會員中心" },
  ];

  const hasActiveAnnouncements = useHasActiveAnnouncements();
  const {
    chats,
    setIsChatOpen,
    setActiveRoomId,
    activateRoomById,
    openChatWithPartner,
  } = useHkCardVaultStore();

  // 點擊外面收起下拉選單
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node)
      ) {
        setIsInboxOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 網頁端廣播接收器同步升級 ➔ 轉化為 Zustand Action
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
        return;
      }
      if (detail?.partnerId) {
        openChatWithPartner(
          detail.partnerId,
          detail.partnerName || "\u672a\u77e5\u540d\u5546\u6236",
          detail.partnerPersona ?? "member",
        );
      }
    };

    window.addEventListener("open-global-chat", handleGlobalOpenChat);
    return () =>
      window.removeEventListener("open-global-chat", handleGlobalOpenChat);
  }, [activateRoomById, openChatWithPartner]);

  const personaChats = filterChatRoomsForViewerPersona(
    chats,
    activeListingPersona,
  );

  const totalUnread = isGuest
    ? 0
    : personaChats
        .filter((room) => !isChatRoomId(room.id))
        .reduce((acc, curr) => acc + curr.unreadCount, 0);

  const breadcrumb = getHeaderBreadcrumb(pathname);

  return (
    <>
      <header className="hidden lg:flex sticky top-0 z-50 w-full h-14 bg-[#17130f]/95 backdrop-blur-md border-b border-white/[0.06]">
        <div className="max-w-[1100px] mx-auto w-full px-6 lg:px-8 h-14 flex items-center gap-4">
          <div className="flex items-center gap-3 min-w-0 shrink-0">
            <Link
              href="/"
              className="flex items-center gap-2.5 shrink-0 group"
            >
              <Image
                src="/asset/logo.png"
                alt="HKCardVault"
                width={32}
                height={32}
                className="h-8 w-8 rounded-lg object-cover ring-1 ring-white/[0.06] group-hover:ring-brand/25 transition-all"
              />
              <BrandWordmark
                className="text-[16px] font-semibold group-hover:[&>span:last-child]:text-brand-hover [&>span:last-child]:transition-colors"
              />
            </Link>

            {breadcrumb ? (
              <HeaderBreadcrumbNav breadcrumb={breadcrumb} />
            ) : null}
          </div>

          {!breadcrumb ? (
            <nav className="flex items-center gap-0.5 mx-auto">
              {navLinks.map((link) => {
                const isActive =
                  link.href === "/"
                    ? pathname === "/"
                    : pathname === link.href ||
                      pathname.startsWith(link.href + "/");

                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`h-8 px-3.5 inline-flex items-center rounded-lg font-sans text-[13px] font-medium transition-colors ${
                      isActive
                        ? "text-brand bg-white/[0.06]"
                        : "text-[#d4c4b7] hover:text-[#eae1da] hover:bg-white/[0.04]"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          ) : (
            <div className="flex-1" />
          )}

          <div className="flex items-center gap-1.5 shrink-0">
            <Link
              href="/announcements"
              title="官方公告"
              className="relative h-9 w-9 inline-flex items-center justify-center text-text-secondary hover:text-brand transition-colors rounded-lg hover:bg-white/[0.04] active:scale-[0.95]"
            >
              <Megaphone className="h-[18px] w-[18px]" />
              {hasActiveAnnouncements && (
                <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-brand" />
                </span>
              )}
            </Link>

            <div className="relative" ref={popoverRef}>
              <button
                type="button"
                aria-label="收件匣"
                onClick={() => setIsInboxOpen(!isInboxOpen)}
                className={`relative h-9 w-9 inline-flex items-center justify-center text-text-secondary hover:text-brand transition-colors rounded-lg hover:bg-white/[0.04] active:scale-[0.95] ${
                  isInboxOpen ? "text-brand bg-white/[0.06]" : ""
                }`}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden
                >
                  <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                  <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
                </svg>
                {totalUnread > 0 && <ChatUnreadDot glow />}
              </button>

              <AnimatePresence>
                {isInboxOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 top-12 w-[320px] bg-[#26211C] border border-[rgba(237,232,224,0.12)] rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col z-50 text-[#eae1da]"
                  >
                    <div className="p-3 bg-[#2e2925] border-b border-[rgba(237,232,224,0.06)] flex justify-between items-center">
                      <span className="font-sans font-bold text-[12px] uppercase tracking-wider text-text-secondary">
                        即時交易通知
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsChatOpen(true)}
                        className="font-sans text-[11px] text-brand hover:underline"
                      >
                        展開面板
                      </button>
                    </div>

                    <div className="max-h-[280px] overflow-y-auto p-1.5 space-y-0.5 scrollbar-none bg-[#17130f]">
                      {personaChats.map((room) => (
                        <button
                          key={room.id}
                          onClick={() => {
                            setIsChatOpen(true);
                            setIsInboxOpen(false);
                            setActiveRoomId(room.id);
                          }}
                          className="w-full text-left p-2.5 rounded-xl hover:bg-[#26211C] transition-all flex items-start gap-2.5 group border border-transparent"
                        >
                          <div className="w-8 h-8 rounded-full bg-[#2e2925] border border-brand/20 flex items-center justify-center font-bold text-brand shrink-0 text-[12px]">
                            {room.partnerName[0]}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex justify-between items-center">
                              <span className="font-sans font-semibold text-[12.5px] group-hover:text-brand transition-colors text-text-primary">
                                {room.partnerName}
                              </span>
                              <span className="font-mono text-[9px] text-text-disabled">
                                {room.timestamp}
                              </span>
                            </div>
                            <p className="font-sans text-[11.5px] text-text-secondary truncate mt-0.5">
                              {room.lastMessage}
                            </p>
                          </div>
                          {room.unreadCount > 0 && (
                            <ChatUnreadDotInline className="mt-2" />
                          )}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {!isGuest ? (
              <button
                type="button"
                onClick={() => openAddAssetModal({ mode: "merch" })}
                className="h-9 px-3.5 ml-1 gap-1.5 bg-brand hover:bg-brand-hover text-[#17130f] rounded-lg inline-flex items-center justify-center active:scale-[0.97] transition-all cursor-pointer focus:outline-none group animate-fadeIn"
                title="新增商品"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  className="group-hover:rotate-90 transition-transform duration-200 shrink-0"
                  aria-hidden
                >
                  <line x1="12" y1="5" x2="12" y2="19" strokeLinecap="round" />
                  <line x1="5" y1="12" x2="19" y2="12" strokeLinecap="round" />
                </svg>
                <span className="font-sans text-[13px] font-semibold">
                  新增商品
                </span>
              </button>
            ) : (
              <Link
                href="/auth"
                className="h-9 px-3.5 ml-1 font-sans text-[13px] font-semibold text-[#17130f] bg-brand rounded-lg hover:bg-brand-hover inline-flex items-center justify-center active:scale-[0.97] transition-all animate-fadeIn"
              >
                登入 / 註冊
              </Link>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
