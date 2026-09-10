"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAdminModerationChatThread } from "@/app/actions/admin-moderation";
import { formatModerationDateTime } from "@/lib/moderation/admin-case-presenters";
import {
  formatModerationChatMessageContent,
  isModerationChatSystemEvent,
  shortModerationRefId,
} from "@/lib/moderation/format-chat-message";
import { highlightSensitiveKeywords } from "@/lib/moderation/highlight-chat-keywords";
import type { AdminModerationChatMessage } from "@/lib/moderation/types";
import { Button } from "@/components/ui/button";
import { BTN_OUTLINE_CLASS, META_TEXT_CLASS } from "./moderation-detail-ui";

interface ModerationChatThreadPanelProps {
  caseId: string;
  roomId: string;
  subjectUserId: string;
}

function ChatMessageRefs({ message }: { message: AdminModerationChatMessage }) {
  const refs: { label: string; value: string }[] = [];

  if (message.offerId) {
    refs.push({ label: "開價", value: shortModerationRefId(message.offerId) });
  }
  if (message.memberOrderId) {
    refs.push({ label: "訂單", value: shortModerationRefId(message.memberOrderId) });
  }
  if (message.merchantOrderId) {
    refs.push({
      label: "商戶訂單",
      value: shortModerationRefId(message.merchantOrderId),
    });
  }

  if (refs.length === 0) {
    return null;
  }

  return (
    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
      {refs.map((ref) => (
        <span key={`${ref.label}-${ref.value}`} className={META_TEXT_CLASS}>
          {ref.label}{" "}
          <span className="font-mono text-text-disabled/80">{ref.value}</span>
        </span>
      ))}
    </div>
  );
}

export default function ModerationChatThreadPanel({
  caseId,
  roomId,
  subjectUserId,
}: ModerationChatThreadPanelProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<AdminModerationChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadThread = useCallback(
    async (before?: string, append = false) => {
      if (append) {
        setLoadingOlder(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const result = await getAdminModerationChatThread({
        caseId,
        roomId,
        before,
      });

      if (append) {
        setLoadingOlder(false);
      } else {
        setLoading(false);
      }

      if (!result.success) {
        setError(result.error);
        return;
      }

      setMessages((current) =>
        append ? [...result.data.messages, ...current] : result.data.messages,
      );
      setHasMore(result.data.hasMore);
      setNextBefore(result.data.nextBefore);

      if (!append) {
        router.refresh();
      }
    },
    [caseId, roomId, router],
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);

      const result = await getAdminModerationChatThread({
        caseId,
        roomId,
      });

      if (cancelled) {
        return;
      }

      setLoading(false);

      if (!result.success) {
        setError(result.error);
        return;
      }

      setMessages(result.data.messages);
      setHasMore(result.data.hasMore);
      setNextBefore(result.data.nextBefore);
      router.refresh();
    })();

    return () => {
      cancelled = true;
    };
  }, [caseId, roomId, router]);

  if (loading) {
    return (
      <p className="font-sans text-[13px] text-text-disabled">載入聊天紀錄中…</p>
    );
  }

  if (error) {
    return <p className="font-sans text-[13px] text-error">{error}</p>;
  }

  if (messages.length === 0) {
    return (
      <p className="font-sans text-[13px] text-text-disabled">
        此聊天室尚無訊息紀錄。
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {hasMore ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loadingOlder || !nextBefore}
          onClick={() => {
            if (nextBefore) {
              void loadThread(nextBefore, true);
            }
          }}
          className={`h-8 ${BTN_OUTLINE_CLASS}`}
        >
          {loadingOlder ? "載入中…" : "載入更早訊息"}
        </Button>
      ) : null}

      <div className="max-h-[420px] divide-y divide-white/[0.06] overflow-y-auto pr-1">
        {messages.map((message) => {
          const isSubject = message.senderId === subjectUserId;
          const isSystemEvent = isModerationChatSystemEvent(message.content);
          const isSystem = message.isSystemWarning || isSystemEvent;
          const displayContent = formatModerationChatMessageContent(
            message.content,
          );

          return (
            <div
              key={message.id}
              className={`py-2.5 first:pt-0 ${
                isSystem ? "bg-brand/5 -mx-1 px-1 rounded-md" : ""
              }`}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span
                  className={`font-sans text-[12px] font-medium ${
                    isSystem ? "text-brand" : "text-text-primary"
                  }`}
                >
                  {isSystemEvent
                    ? "系統通知"
                    : (message.senderDisplayName ?? "未知用戶")}
                </span>
                {!isSystemEvent && isSubject ? (
                  <span className={META_TEXT_CLASS}>被舉報人</span>
                ) : null}
                <span className={META_TEXT_CLASS}>
                  {formatModerationDateTime(message.createdAt)}
                </span>
              </div>
              <p
                className={`mt-1 font-sans text-[13px] leading-relaxed ${
                  isSystem ? "text-text-primary" : "text-text-secondary"
                }`}
              >
                {highlightSensitiveKeywords(displayContent)}
              </p>
              <ChatMessageRefs message={message} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
