"use client";

import { useState } from "react";
import Image from "next/image";
import { ImageViewer } from "@/app/components/shared/ImageViewer";
import type { AdminReportAttachmentRow } from "@/lib/moderation/types";

type ModerationEvidencePanelProps = {
  attachments: AdminReportAttachmentRow[];
};

export default function ModerationEvidencePanel({
  attachments,
}: ModerationEvidencePanelProps) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const viewableAttachments = attachments.filter((attachment) =>
    Boolean(attachment.publicUrl),
  );
  const images = viewableAttachments.map(
    (attachment) => attachment.publicUrl as string,
  );

  if (attachments.length === 0) {
    return (
      <p className="font-sans text-[12px] text-text-disabled">暫無證據圖片。</p>
    );
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {attachments.map((attachment) => {
          if (!attachment.publicUrl) {
            return (
              <div
                key={attachment.id}
                className="flex aspect-square items-center justify-center rounded-lg bg-bg-card/40 px-2 text-center font-sans text-[11px] text-text-disabled"
              >
                圖片不可用
              </div>
            );
          }

          const imageIndex = viewableAttachments.findIndex(
            (item) => item.id === attachment.id,
          );

          return (
            <button
              key={attachment.id}
              type="button"
              onClick={() => {
                setViewerIndex(imageIndex);
                setViewerOpen(true);
              }}
              className="relative aspect-square overflow-hidden rounded-lg bg-bg-card/40 cursor-zoom-in transition-colors hover:bg-brand/5 active:scale-[0.98]"
              aria-label={`查看舉報證據 ${imageIndex + 1}`}
            >
              <Image
                src={attachment.publicUrl}
                alt="舉報證據"
                fill
                sizes="(max-width: 640px) 30vw, 100px"
                className="object-cover transition-transform duration-300 hover:scale-105"
                unoptimized
              />
            </button>
          );
        })}
      </div>

      <ImageViewer
        isOpen={viewerOpen}
        onClose={() => setViewerOpen(false)}
        images={images}
        initialIndex={viewerIndex}
      />
    </>
  );
}
