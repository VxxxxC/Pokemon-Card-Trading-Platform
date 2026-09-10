"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { updateUserFpsId } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type FpsIdCollectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialFpsId?: string | null;
  initialFpsName?: string | null;
  onSaved?: () => void;
};

export function FpsIdCollectDialog({
  open,
  onOpenChange,
  initialFpsId,
  initialFpsName,
  onSaved,
}: FpsIdCollectDialogProps) {
  const [draftFpsId, setDraftFpsId] = useState<string | null>(null);
  const [draftFpsName, setDraftFpsName] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const fpsId = draftFpsId ?? initialFpsId ?? "";
  const fpsName = draftFpsName ?? initialFpsName ?? "";

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setDraftFpsId(null);
      setDraftFpsName(null);
    }
    onOpenChange(nextOpen);
  };

  const handleSave = async () => {
    if (isSaving) {
      return;
    }

    setIsSaving(true);
    const result = await updateUserFpsId(fpsId, fpsName);
    setIsSaving(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success("轉數快收款資料已儲存");
    handleOpenChange(false);
    onSaved?.();
  };

  const canSave = fpsId.trim().length > 0 && fpsName.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-[#26211C] border border-white/10 text-[#eae1da]">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-black">
            補充轉數快收款資料
          </DialogTitle>
          <DialogDescription className="text-[12px] text-text-secondary">
            鑑定訂單賣家收款需要轉數快收款人姓名及 ID／電話／電郵。您可稍後於個人設定修改。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <input
            type="text"
            name="fpsName"
            value={fpsName}
            onChange={(event) => setDraftFpsName(event.target.value)}
            placeholder="轉數快收款人姓名（須與銀行登記一致）"
            className="w-full h-10 rounded-lg border border-white/10 bg-[#120f0c] px-3 text-[12px] text-brand"
          />
          <input
            type="text"
            name="fpsId"
            value={fpsId}
            onChange={(event) => setDraftFpsId(event.target.value)}
            placeholder="轉數快 ID / 電話 / 電郵"
            className="w-full h-10 rounded-lg border border-white/10 bg-[#120f0c] px-3 text-[12px] text-brand"
          />
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            type="button"
            disabled={isSaving || !canSave}
            onClick={() => void handleSave()}
            className="w-full h-10 rounded-xl bg-brand text-[#1A1612] font-semibold"
          >
            {isSaving ? "儲存中…" : "儲存"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isSaving}
            onClick={() => handleOpenChange(false)}
            className="w-full h-10 rounded-xl border border-white/10"
          >
            稍後再說
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
