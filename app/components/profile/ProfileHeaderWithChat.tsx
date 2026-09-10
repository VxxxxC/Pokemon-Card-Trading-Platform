"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { X } from "lucide-react";
import { toast } from "sonner";
import { submitUserReport } from "@/app/actions/reports";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// 引入 Shadcn UI 頂級黑金 Select 組件群
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEFAULT_AVATAR_URL } from "@/lib/profile/avatar";

interface Badge {
  id: string;
  label: string;
  emoji: string;
  desc: string;
}

interface ProfileHeaderProps {
  member: {
    id: string;
    username: string;
    handle: string;
    joinDate: string;
    avatarSeed: string;
    avatarUrl?: string;
    level: string;
    completedTrades: number;
    bio: string;
    badges: readonly Badge[];
    rating: number; // 🟢 Added for metrics encapsulation
    reviewCount: number; // 🟢 Added for metrics encapsulation
  };
}

export function ProfileHeaderWithChat({ member }: ProfileHeaderProps) {
  const searchParams = useSearchParams();
  const chatParam = searchParams.get("chat");
  const [isReportOpen, setIsReportOpen] = useState(false);

  // 核心狀態欄位：舉報類別與詳細內文說明
  const [reportCategory, setReportCategory] = useState<string>("");
  const [reportDetails, setReportDetails] = useState<string>("");
  const [isReportSubmitting, setIsReportSubmitting] = useState(false);

  useEffect(() => {
    if (chatParam === "open") {
      window.dispatchEvent(
        new CustomEvent("open-global-chat", {
          detail: {
            partnerId: member.id,
            partnerName: member.username,
            partnerPersona: "member",
          },
        }),
      );
    }
  }, [chatParam, member.id, member.username]);

  const handleActionChat = () => {
    window.dispatchEvent(
      new CustomEvent("open-global-chat", {
        detail: {
          partnerId: member.id,
          partnerName: member.username,
          partnerPersona: "member",
        },
      }),
    );
  };

  const handleReportConfirm = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    if (!reportCategory) {
      toast.error("❌ 請選擇舉報事項類別");
      return;
    }

    if (isReportSubmitting) {
      return;
    }

    setIsReportSubmitting(true);

    try {
      const result = await submitUserReport({
        reportedUserId: member.id,
        category: reportCategory,
        details: reportDetails,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success("⚠️ 舉報信號已受理", {
        description: `【${reportCategory}】商戶風控隊列已啟動。已對該用戶實施鏈上行為快照。`,
        className:
          "bg-[#26211C] border border-red-500/30 text-[#eae1da] font-sans shadow-2xl",
      });

      setIsReportOpen(false);
      setReportCategory("");
      setReportDetails("");
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "提交舉報時發生錯誤";
      toast.error(msg);
    } finally {
      setIsReportSubmitting(false);
    }
  };

  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  if (!isMounted) return null;

  return (
    <section className="relative bg-[#26211C] rounded-2xl border border-[rgba(237,232,224,0.08)] overflow-hidden">
      <div className="h-24 bg-gradient-to-r from-[#2e2925] via-[rgba(140,115,85,0.15)] to-[#2e2925]" />
      <div className="px-6 pb-6">
        <div className="flex items-end justify-between -mt-10 mb-4">
          <div className="relative w-24 h-24 rounded-full border-4 border-[#26211C] shadow-xl overflow-hidden bg-[#17130f]">
            <Image
              src={member.avatarUrl ?? DEFAULT_AVATAR_URL}
              alt="Avatar"
              fill
              className="object-cover"
              unoptimized
            />
          </div>
          <div className="text-right">
            <p className="font-mono text-[11px] text-[#d4c4b7] uppercase">
              總完成交易
            </p>
            <p className="font-mono font-bold text-[20px] text-[#eae1da]">
              {member.completedTrades.toLocaleString()}+
            </p>
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
            <div className="flex items-center gap-3">
              <h1 className="font-sans font-bold text-[24px] text-[#eae1da]">
                {member.username}
              </h1>
            </div>

            <button
              onClick={handleActionChat}
              className="absolute top-4 right-4 z-12 w-12 h-12 rounded-full bg-[#17130f]/60 backdrop-blur-xs border border-[rgba(237,232,224,0.15)] text-text-secondary hover:text-brand hover:border-brand/40 flex items-center justify-center transition-all cursor-pointer shadow-md focus:outline-none"
              type="button"
            >
              💬
            </button>
          </div>

          <p className="font-mono text-[12px] text-brand mb-4">
            {member.handle} · {member.joinDate}
          </p>

          {/* Encapsulated Identity Level + Reputation Score Metrics Box */}
          <div className="flex items-center gap-5 mt-2 mb-4 pt-3 border-t border-white/5 flex-wrap">
            <div className="flex flex-col">
              <span className="font-mono text-[9px] text-[#8A8680] uppercase tracking-wider">
                身分級別
              </span>
              <span className="inline-flex items-center gap-1.5 font-mono text-[12.5px] font-bold text-brand mt-1 bg-[rgba(212,165,116,0.08)] border border-brand/20 px-2 py-0.5 rounded-md">
                {member.level}
              </span>
            </div>
            <div className="w-px h-7 bg-white/5 self-end hidden sm:block" />
            <button
              className="flex flex-col items-start"
              onClick={() => {
                document
                  .getElementById("rating")
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              <span className="font-mono text-[9px] text-[#8A8680] uppercase tracking-wider">
                信用評分
              </span>
              <span className="font-mono text-[13px] text-[#eae1da] font-bold mt-1">
                ⭐ {Number(member.rating).toFixed(1)}{" "}
                <span className="text-[#8A8680] font-normal text-[11px]">
                  ({member.reviewCount} 評)
                </span>
              </span>
            </button>
          </div>

          <p className="font-sans text-[14px] text-[#d4c4b7] leading-relaxed max-w-2xl">
            {member.bio}
          </p>

          {/* 徽章與舉報區 */}
          <div className="flex flex-wrap items-center justify-between mt-5 gap-4">
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none flex-1">
              {member.badges.map((badge) => (
                <div
                  key={badge.id}
                  title={badge.desc}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-[#17130f] border border-[rgba(237,232,224,0.06)] rounded-lg"
                >
                  <span className="text-[14px]">{badge.emoji}</span>
                  <span className="font-mono text-[11px] text-[#d4c4b7]">
                    {badge.label}
                  </span>
                </div>
              ))}
            </div>

            <AlertDialog
              open={isReportOpen}
              onOpenChange={(open) => {
                setIsReportOpen(open);
                if (!open) {
                  setReportCategory("");
                  setReportDetails("");
                }
              }}
            >
              <AlertDialogTrigger className="absolute top-2 left-2 shrink-0 flex items-center gap-1 rounded-md border border-red-500/20 bg-red-500/5 px-2 py-1 text-[12px] font-medium text-red-400/90 transition-colors font-sans lg:border-transparent lg:bg-transparent lg:text-text-disabled/70 lg:hover:text-red-500 cursor-pointer select-none focus:outline-none">
                🚩 舉報用戶
              </AlertDialogTrigger>

              <AlertDialogContent className="max-w-sm gap-0 rounded-2xl border border-[rgba(237,232,224,0.08)] bg-[#26211C] p-5 text-[#eae1da] ring-0 shadow-[0_16px_48px_rgba(0,0,0,0.45)] animate-scaleUp max-h-[min(90dvh,calc(100dvh-2rem))] overflow-y-auto sm:p-6">
                <AlertDialogCancel
                  variant="ghost"
                  size="icon"
                  aria-label="關閉"
                  className="absolute right-3 top-3 z-10 size-8 shrink-0 rounded-lg border border-white/10 bg-[#17130f] text-[#8A8680] hover:bg-[#1A1612] hover:text-[#eae1da]"
                >
                  <X className="size-4" aria-hidden />
                </AlertDialogCancel>

                <AlertDialogHeader className="text-left place-items-start gap-1 pb-3 pr-8">
                  <AlertDialogTitle className="text-[15px] font-black text-[#eae1da]">
                    舉報該商戶用戶
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-[11px] font-mono leading-normal text-[#8A8680] uppercase tracking-wider">
                    Merchant Compliance Audit Protocol
                  </AlertDialogDescription>
                </AlertDialogHeader>

                {/* 下拉配置及詳情表單 */}
                <div className="space-y-4 py-3 font-sans text-[13px] w-full">
                  <div className="space-y-1.5">
                    <label className="block font-mono text-[11px] text-[#d4c4b7] uppercase tracking-wide">
                      選擇舉報事項類別
                    </label>
                    <Select
                      value={reportCategory}
                      onValueChange={(value) => setReportCategory(value ?? "")}
                    >
                      <SelectTrigger className="w-full h-10 bg-[#17130f] border border-white/5 rounded-xl text-[#eae1da] font-sans text-[12px] hover:bg-[#2c2722] transition-colors focus:ring-0 focus:border-brand/40">
                        <SelectValue placeholder="點擊展開違規類別" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#26211C] border border-white/10 rounded-xl text-[#eae1da] font-sans text-[12.5px] shadow-2xl">
                        <SelectItem
                          value="惡意欺詐 / 虛假交易"
                          className="focus:bg-[#322a24] focus:text-brand cursor-pointer transition-colors"
                        >
                          🛑 惡意欺詐 / 虛假交易 (FRAUD)
                        </SelectItem>
                        <SelectItem
                          value="言語辱罵 / 不當言論"
                          className="focus:bg-[#322a24] focus:text-brand cursor-pointer transition-colors"
                        >
                          💬 言語辱罵 / 不當言論 (HARASS)
                        </SelectItem>
                        <SelectItem
                          value="誘導私下交易"
                          className="focus:bg-[#322a24] focus:text-brand cursor-pointer transition-colors"
                        >
                          🔒 誘導私下交易 / 逃避中介 (OFFLINE)
                        </SelectItem>
                        <SelectItem
                          value="其他違規行為"
                          className="focus:bg-[#322a24] focus:text-brand cursor-pointer transition-colors"
                        >
                          ⚙️ 其他違規行為 (OTHER)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="profile-report-details"
                      className="block font-mono text-[11px] text-[#d4c4b7] uppercase tracking-wide"
                    >
                      詳細說明
                    </label>
                    <textarea
                      id="profile-report-details"
                      value={reportDetails}
                      onChange={(e) => setReportDetails(e.target.value)}
                      placeholder="請具體描述該用戶的違規事實（例如：收到貨件與敘述嚴重不符、在其他渠道進行詐騙等）。"
                      rows={3}
                      className="w-full bg-[#17130f] border border-white/5 rounded-xl text-[12.5px] font-sans text-[#eae1da] placeholder:text-[#50453b] p-3 focus:outline-none focus:border-brand/40 transition-colors resize-none leading-relaxed"
                    />
                  </div>

                  <p className="rounded-xl border border-warning/20 bg-warning/5 px-3 py-2.5 text-[11px] leading-relaxed text-[#c9b8a8]">
                    <span className="font-semibold text-warning">聲明：</span>
                    平台嚴格禁止惡意惡作劇或虛假舉報。一經查實虛報，將面臨賬戶風控扣分限制。
                  </p>
                </div>

                <div className="pt-4 w-full">
                  <AlertDialogAction
                    type="button"
                    onClick={handleReportConfirm}
                    disabled={isReportSubmitting}
                    className="h-11 w-full rounded-xl bg-brand font-sans text-[13px] font-semibold text-[#17130f] transition-colors hover:bg-brand-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isReportSubmitting ? "提交中…" : "確認提交"}
                  </AlertDialogAction>
                </div>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>
    </section>
  );
}
