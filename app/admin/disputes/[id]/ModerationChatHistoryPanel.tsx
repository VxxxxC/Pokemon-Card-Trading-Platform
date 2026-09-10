"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ModerationChatThreadPanel from "./ModerationChatThreadPanel";
import { ModerationExpandToggle } from "./ModerationExpandToggle";
import {
  SELECT_CONTENT_CLASS,
  SELECT_ITEM_CLASS,
  SELECT_TRIGGER_CLASS,
  SECTION_DIVIDER_CLASS,
  SECTION_TITLE_CLASS,
  META_TEXT_CLASS,
  EXPANDED_CONTENT_CLASS,
} from "./moderation-detail-ui";

type ModerationChatHistoryPanelProps = {
  caseId: string;
  subjectUserId: string;
  chatRoomIds: string[];
};

export default function ModerationChatHistoryPanel({
  caseId,
  subjectUserId,
  chatRoomIds,
}: ModerationChatHistoryPanelProps) {
  const [open, setOpen] = useState(false);
  const [selectedChatRoomId, setSelectedChatRoomId] = useState<string | null>(
    chatRoomIds[0] ?? null,
  );

  const hasRooms = chatRoomIds.length > 0;
  const roomSummary = hasRooms
    ? chatRoomIds.length === 1
      ? chatRoomIds[0].slice(0, 8)
      : `${chatRoomIds.length} 個聊天室`
    : null;

  return (
    <section className={SECTION_DIVIDER_CLASS}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={SECTION_TITLE_CLASS}>唯讀聊天室歷史</h2>
        {hasRooms ? (
          <div className="flex items-center gap-3">
            {roomSummary ? (
              <span className={`${META_TEXT_CLASS} font-mono`}>
                {roomSummary}
              </span>
            ) : null}
            <ModerationExpandToggle
              open={open}
              onToggle={() => setOpen((value) => !value)}
            />
          </div>
        ) : null}
      </div>

      {!hasRooms ? (
        <p className="font-sans text-[13px] leading-relaxed text-text-secondary">
          此案件尚未綁定可調閱的聊天室紀錄。
        </p>
      ) : open ? (
        <div className={`${EXPANDED_CONTENT_CLASS} space-y-3`}>
          {chatRoomIds.length > 1 ? (
            <Select
              value={selectedChatRoomId ?? ""}
              onValueChange={(value) => setSelectedChatRoomId(value || null)}
            >
              <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                <SelectValue placeholder="選擇聊天室" />
              </SelectTrigger>
              <SelectContent className={SELECT_CONTENT_CLASS}>
                {chatRoomIds.map((roomId) => (
                  <SelectItem
                    key={roomId}
                    value={roomId}
                    className={SELECT_ITEM_CLASS}
                  >
                    聊天室 {roomId.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {selectedChatRoomId ? (
            <ModerationChatThreadPanel
              caseId={caseId}
              roomId={selectedChatRoomId}
              subjectUserId={subjectUserId}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
