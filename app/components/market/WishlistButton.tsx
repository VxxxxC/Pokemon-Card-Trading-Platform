"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { toggleWishlist } from "@/app/actions/wishlist";
import { useIsMemberPersonaActive } from "@/app/lib/hooks/useIsMemberPersonaActive";
import { MEMBER_PERSONA_FEATURES_BLOCKED_ERROR } from "@/lib/auth/member-persona-features";
import { buildWishlistFavoredKey } from "@/lib/wishlist/grading";

interface WishlistButtonProps {
  productId?: string;
  gradingCompany?: string;
  gradingScore?: string | null;
  trackedPrice?: number | null;
  initialIsFavored?: boolean;
  /** When `null`, skip API and show login toast immediately. */
  currentUserId?: string | null;
  className?: string;
  size?: "sm" | "md";
  /** @deprecated Use productId */
  listingId?: string;
}

function showWishlistLoginToast(onAuth: () => void) {
  toast.error("請先登入以使用願望清單", {
    description: "登入或註冊後即可追蹤卡價與願望清單。",
    duration: 8000,
    action: {
      label: "登入 / 註冊",
      onClick: onAuth,
    },
  });
}

export function WishlistButton({
  productId,
  gradingCompany = "RAW",
  gradingScore = "A",
  trackedPrice = null,
  initialIsFavored = false,
  currentUserId,
  className = "",
  size = "md",
  listingId,
}: WishlistButtonProps) {
  const router = useRouter();
  const isMemberPersonaActive = useIsMemberPersonaActive();
  const resolvedProductId = (productId ?? listingId ?? "").trim();
  void listingId;

  const [isFavored, setIsFavored] = useState(initialIsFavored);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setIsFavored(initialIsFavored);
  }, [initialIsFavored]);

  const handleToggle = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (!resolvedProductId) return;

      if (!isMemberPersonaActive) {
        toast.error(MEMBER_PERSONA_FEATURES_BLOCKED_ERROR);
        return;
      }

      if (currentUserId === null) {
        showWishlistLoginToast(() => router.push("/auth"));
        return;
      }

      const previous = isFavored;
      setIsFavored(!previous);

      startTransition(async () => {
        const result = await toggleWishlist({
          productId: resolvedProductId,
          gradingCompany,
          gradingScore,
          trackedPrice:
            trackedPrice != null && trackedPrice > 0 ? trackedPrice : null,
        });

        if (!result.success) {
          setIsFavored(previous);
          if (result.error === "請先登入") {
            showWishlistLoginToast(() => router.push("/auth"));
          } else {
            toast.error(result.error);
          }
          return;
        }

        setIsFavored(result.data.isFavored);

        if (result.data.isFavored) {
          toast.success("已加入願望清單", {
            description: "已開始追蹤此卡價格走勢。",
            action: {
              label: "查看清單",
              onClick: () => router.push("/profile/user/collection"),
            },
          });
        }
      });
    },
    [
      currentUserId,
      gradingCompany,
      gradingScore,
      isFavored,
      isMemberPersonaActive,
      resolvedProductId,
      router,
      trackedPrice,
    ],
  );

  if (!isMemberPersonaActive) {
    return null;
  }

  const buttonSizeClass = size === "sm" ? "w-6 h-6" : "w-8 h-8";
  const iconSizeClass = size === "sm" ? "w-3 h-3" : "w-4 h-4";

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={isPending}
      aria-label={isFavored ? "從願望清單移除" : "加入願望清單"}
      aria-pressed={isFavored}
      className={[
        `group/star flex items-center justify-center ${buttonSizeClass} rounded-full`,
        "bg-[#17130f]/70 backdrop-blur-sm border border-[rgba(237,232,224,0.12)]",
        "active:scale-90 transition-all duration-200",
        isFavored ? "shadow-[0_0_10px_rgba(212,165,116,0.3)]" : "",
        isPending ? "opacity-70" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {isFavored ? (
        <Heart
          className={`${iconSizeClass} text-brand fill-brand transition-all duration-200`}
          strokeWidth={2}
          aria-hidden="true"
        />
      ) : (
        <Heart
          className={`${iconSizeClass} text-text-secondary transition-all duration-200 group-hover/star:text-brand group-hover/star:scale-110`}
          strokeWidth={2}
          aria-hidden="true"
        />
      )}
    </button>
  );
}

export function isWishlistFavored(
  favoredKeys: ReadonlySet<string> | undefined,
  productId: string,
  gradingCompany: string,
  gradingScore: string | null | undefined,
): boolean {
  if (!favoredKeys || favoredKeys.size === 0) return false;
  return favoredKeys.has(
    buildWishlistFavoredKey(productId, gradingCompany, gradingScore),
  );
}
