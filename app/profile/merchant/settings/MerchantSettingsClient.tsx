"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { toast } from "sonner";
import { LogoutModal } from "@/app/components/profile/LogoutModal";
import {
  updateMerchantShopAvatar,
  updateMerchantShopProfile,
  updateMerchantShopTopBanner,
  type MerchantSettingsData,
} from "@/app/actions/merchant-settings";
import type { MerchantShopFormErrors } from "@/lib/merchant/validation";
import {
  uploadMerchantShopAvatar,
  uploadMerchantShopTopBanner,
} from "@/lib/merchant/client-upload";
import { DEFAULT_AVATAR_URL } from "@/lib/profile/avatar";
import { cn } from "@/lib/utils";
import { SECTION_TITLE_CLASS } from "@/lib/ui/section-title-ui";

type Props = {
  initialData: MerchantSettingsData;
};

const labelClass =
  "font-mono text-[10px] text-text-secondary block mb-1 leading-snug";

const settingsListRowClass =
  "flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4";

function fieldClass(hasError: boolean): string {
  return cn(
    "w-full h-10 px-3 bg-bg-page/50 border rounded-lg font-sans text-[13px] text-text-primary placeholder:text-text-disabled focus:outline-none transition-colors",
    hasError
      ? "border-warning focus:border-warning"
      : "border-[rgba(237,232,224,0.08)] focus:border-brand/30",
  );
}

function SettingsSection({
  id,
  title,
  children,
  variant = "default",
}: {
  id: string;
  title: string;
  children: ReactNode;
  variant?: "default" | "list";
}) {
  return (
    <section
      aria-labelledby={id}
      className="rounded-xl overflow-hidden bg-bg-card border border-[rgba(237,232,224,0.08)]"
    >
      <div className="px-3 py-2.5 sm:px-4 border-b border-[rgba(237,232,224,0.06)]">
        <h2
          id={id}
          className={SECTION_TITLE_CLASS}
        >
          {title}
        </h2>
      </div>
      <div
        className={cn(
          variant === "list"
            ? "divide-y divide-[rgba(237,232,224,0.06)]"
            : "p-3.5 sm:p-4",
        )}
      >
        {children}
      </div>
    </section>
  );
}

export function MerchantSettingsClient({ initialData }: Props) {
  const router = useRouter();
  const [avatarOverrideUrl, setAvatarOverrideUrl] = useState<string | null>(null);
  const [isAvatarUploading, setIsAvatarUploading] = useState(false);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  const displayAvatarUrl =
    avatarOverrideUrl ?? initialData.shopAvatarUrl ?? DEFAULT_AVATAR_URL;

  const [bannerOverrideUrl, setBannerOverrideUrl] = useState<string | null>(null);
  const [isBannerUploading, setIsBannerUploading] = useState(false);
  const bannerFileInputRef = useRef<HTMLInputElement>(null);
  const displayBannerUrl = bannerOverrideUrl ?? initialData.topBannerUrl;

  const [errors, formAction, isPending] = useActionState<
    MerchantShopFormErrors | null,
    FormData
  >(updateMerchantShopProfile, null);

  const wasPending = useRef(false);

  const handleAvatarEditClick = useCallback(() => {
    if (isAvatarUploading) return;
    avatarFileInputRef.current?.click();
  }, [isAvatarUploading]);

  const handleAvatarFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;

      const localPreview = URL.createObjectURL(file);
      setAvatarOverrideUrl(localPreview);
      setIsAvatarUploading(true);

      try {
        const { cdnUrl } = await uploadMerchantShopAvatar(file);
        const result = await updateMerchantShopAvatar(cdnUrl);
        if (!result.success) {
          throw new Error(result.error);
        }

        URL.revokeObjectURL(localPreview);
        setAvatarOverrideUrl(cdnUrl);
        toast.success("店舖頭像已更新");
        router.refresh();
      } catch (error) {
        URL.revokeObjectURL(localPreview);
        setAvatarOverrideUrl(null);
        toast.error(
          error instanceof Error ? error.message : "店舖頭像上載失敗，請稍後再試",
        );
      } finally {
        setIsAvatarUploading(false);
      }
    },
    [router],
  );

  const handleBannerEditClick = useCallback(() => {
    if (isBannerUploading) return;
    bannerFileInputRef.current?.click();
  }, [isBannerUploading]);

  const handleBannerFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;

      const localPreview = URL.createObjectURL(file);
      setBannerOverrideUrl(localPreview);
      setIsBannerUploading(true);

      try {
        const { cdnUrl } = await uploadMerchantShopTopBanner(file);
        const result = await updateMerchantShopTopBanner(cdnUrl);
        if (!result.success) {
          throw new Error(result.error);
        }

        URL.revokeObjectURL(localPreview);
        setBannerOverrideUrl(cdnUrl);
        toast.success("店舖橫幅已更新");
        router.refresh();
      } catch (error) {
        URL.revokeObjectURL(localPreview);
        setBannerOverrideUrl(null);
        toast.error(
          error instanceof Error ? error.message : "店舖橫幅上載失敗，請稍後再試",
        );
      } finally {
        setIsBannerUploading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    if (wasPending.current && !isPending) {
      if (errors === null) {
        toast.success("店舖資料已更新");
        router.refresh();
      } else if (errors.shopHandle) {
        toast.error(errors.shopHandle);
      } else if (errors.shopName) {
        toast.error(errors.shopName);
      } else if (errors.baseCourierShippingFee) {
        toast.error(errors.baseCourierShippingFee);
      } else if (errors.form) {
        toast.error(errors.form);
      }
    }
    wasPending.current = isPending;
  }, [isPending, errors, router]);

  return (
    <div className="space-y-3 animate-fadeIn">
      <div className="space-y-3">
        <form action={formAction} className="space-y-3">
          {errors?.form && (
            <p className="font-sans text-[12px] text-warning">{errors.form}</p>
          )}

          <SettingsSection id="shop-info-heading" title="店舖資料">
            <div className="space-y-4">
              <div className="flex items-center gap-3 pb-4 border-b border-[rgba(237,232,224,0.06)]">
                <div className="relative w-14 h-14 shrink-0">
                  <div className="relative w-full h-full rounded-full border-2 border-bg-card overflow-hidden bg-[#17130f]">
                    <Image
                      src={displayAvatarUrl}
                      alt={`${initialData.shopName} 的店舖頭像`}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                    {isAvatarUploading ? (
                      <div className="absolute inset-0 z-[1] flex items-center justify-center bg-[#17130f]/70">
                        <div className="w-5 h-5 rounded-full border-2 border-brand border-t-transparent animate-spin" />
                      </div>
                    ) : null}
                  </div>
                  <input
                    ref={avatarFileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                    className="hidden"
                    onChange={handleAvatarFileChange}
                  />
                  <button
                    type="button"
                    onClick={handleAvatarEditClick}
                    disabled={isAvatarUploading}
                    className="absolute -bottom-0.5 -right-0.5 z-10 w-5 h-5 rounded-full bg-[#17130f]/90 border border-[rgba(237,232,224,0.2)] text-text-secondary hover:text-brand hover:border-brand/40 flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="更換店舖頭像"
                    aria-label="更換店舖頭像"
                  >
                    <Camera size={10} aria-hidden="true" />
                  </button>
                </div>
                <div className="min-w-0">
                  <p className={SECTION_TITLE_CLASS}>
                    店舖頭像
                  </p>
                  <p className="font-mono text-[10px] text-text-secondary mt-0.5">
                    獨立於會員個人頭像 · JPG / PNG / WEBP
                  </p>
                </div>
              </div>

              <div className="space-y-2 pb-4 border-b border-[rgba(237,232,224,0.06)]">
                <div className="relative w-full h-20 sm:h-24">
                  <div className="relative w-full h-full rounded-lg border border-[rgba(237,232,224,0.08)] overflow-hidden bg-linear-to-r from-[#2a2318] via-[rgba(212,165,116,0.12)] to-[#2a2318]">
                    {displayBannerUrl ? (
                      <Image
                        src={displayBannerUrl}
                        alt={`${initialData.shopName} 的店舖橫幅`}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    ) : null}
                    {isBannerUploading ? (
                      <div className="absolute inset-0 z-[1] flex items-center justify-center bg-[#17130f]/70">
                        <div className="w-5 h-5 rounded-full border-2 border-brand border-t-transparent animate-spin" />
                      </div>
                    ) : null}
                  </div>
                  <input
                    ref={bannerFileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                    className="hidden"
                    onChange={handleBannerFileChange}
                  />
                  <button
                    type="button"
                    onClick={handleBannerEditClick}
                    disabled={isBannerUploading}
                    className="absolute bottom-2 right-2 z-10 w-6 h-6 rounded-full bg-[#17130f]/90 border border-[rgba(237,232,224,0.2)] text-text-secondary hover:text-brand hover:border-brand/40 flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="更換店舖橫幅"
                    aria-label="更換店舖橫幅"
                  >
                    <Camera size={12} aria-hidden="true" />
                  </button>
                </div>
                <div>
                  <p className={SECTION_TITLE_CLASS}>
                    店舖頂部橫幅
                  </p>
                  <p className="font-mono text-[10px] text-text-secondary mt-0.5">
                    顯示於商戶店舖頁頂部 · JPG / PNG / WEBP
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label htmlFor="shop-name" className={labelClass}>
                    店舖名稱
                  </label>
                  <input
                    id="shop-name"
                    name="shopName"
                    type="text"
                    required
                    defaultValue={initialData.shopName}
                    key={`shopName-${initialData.shopName}`}
                    className={fieldClass(!!errors?.shopName)}
                  />
                  {errors?.shopName && (
                    <p className="mt-1 font-sans text-[11px] text-warning">
                      {errors.shopName}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="shop-handle" className={labelClass}>
                    店舖帳號
                  </label>
                  <div
                    className={cn(
                      "flex items-center h-10 bg-bg-page/50 border rounded-lg overflow-hidden transition-colors",
                      errors?.shopHandle
                        ? "border-warning"
                        : "border-[rgba(237,232,224,0.08)] focus-within:border-brand/30",
                    )}
                  >
                    <span className="px-3 font-mono text-[12px] text-text-disabled border-r border-[rgba(237,232,224,0.08)] bg-bg-page/80 shrink-0">
                      @
                    </span>
                    <input
                      id="shop-handle"
                      name="shopHandle"
                      type="text"
                      defaultValue={initialData.shopHandle}
                      key={`shopHandle-${initialData.shopHandle}`}
                      placeholder="選填"
                      className="flex-1 min-w-0 h-full bg-transparent pl-3 pr-3 font-mono text-[13px] text-text-primary focus:outline-none"
                    />
                  </div>
                  {errors?.shopHandle && (
                    <p className="mt-1 font-sans text-[11px] text-warning">
                      {errors.shopHandle}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="base-courier-shipping-fee" className={labelClass}>
                    快遞運費（面交訂單不收費）
                  </label>
                  <div
                    className={cn(
                      "flex items-center h-10 bg-bg-page/50 border rounded-lg overflow-hidden transition-colors",
                      errors?.baseCourierShippingFee
                        ? "border-warning"
                        : "border-[rgba(237,232,224,0.08)] focus-within:border-brand/30",
                    )}
                  >
                    <span className="px-3 font-mono text-[12px] text-text-disabled border-r border-[rgba(237,232,224,0.08)] bg-bg-page/80 shrink-0">
                      HK$
                    </span>
                    <input
                      id="base-courier-shipping-fee"
                      name="baseCourierShippingFee"
                      type="number"
                      min={0}
                      max={500}
                      step={1}
                      required
                      defaultValue={initialData.baseCourierShippingFee}
                      key={`baseCourierShippingFee-${initialData.baseCourierShippingFee}`}
                      className="flex-1 min-w-0 h-full bg-transparent pl-3 pr-3 font-mono text-[13px] text-text-primary focus:outline-none"
                    />
                  </div>
                  <p className="mt-1 font-mono text-[10px] text-text-disabled">
                    買家選擇快遞配送時收取的店舖基本運費
                  </p>
                  {errors?.baseCourierShippingFee && (
                    <p className="mt-1 font-sans text-[11px] text-warning">
                      {errors.baseCourierShippingFee}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="shop-bio" className={labelClass}>
                    店舖簡介
                  </label>
                  <textarea
                    id="shop-bio"
                    name="shopDescription"
                    rows={2}
                    defaultValue={initialData.shopDescription}
                    key={`shopDescription-${initialData.shopDescription}`}
                    placeholder="介紹你的店舖特色或服務（選填）"
                    className={cn(
                      fieldClass(!!errors?.shopDescription),
                      "h-auto min-h-[3.25rem] sm:min-h-[4.5rem] py-2.5 resize-none",
                    )}
                  />
                  {errors?.shopDescription && (
                    <p className="mt-1 font-sans text-[11px] text-warning">
                      {errors.shopDescription}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </SettingsSection>

          <button
            type="submit"
            disabled={isPending}
            className="w-full h-10 bg-brand text-[#17130f] font-sans font-semibold text-[13px] rounded-lg hover:bg-brand-hover active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? "儲存中…" : "儲存更改"}
          </button>
        </form>

        <SettingsSection id="security-heading" title="安全設定" variant="list">
          <div className={settingsListRowClass}>
            <div className="min-w-0">
              <p className="font-mono text-[10px] text-text-secondary">
                電郵地址
              </p>
              <p className="font-sans text-[13px] text-text-primary font-medium break-all mt-0.5">
                {initialData.email || "—"}
              </p>
            </div>
          </div>
          <div className={settingsListRowClass}>
            <div className="min-w-0">
              <p className="font-mono text-[10px] text-text-secondary">
                登入密碼
              </p>
              <p className="font-sans text-[13px] text-text-primary font-medium mt-0.5">
                ••••••••••••
              </p>
            </div>
            <Link
              href="/auth/reset-password"
              className="shrink-0 font-mono text-[10px] text-brand hover:text-brand-hover transition-colors"
            >
              更改
            </Link>
          </div>
        </SettingsSection>

        <SettingsSection id="notif-heading" title="通知設定" variant="list">
          {[
            {
              label: "新訂單通知",
              desc: "買家下單即時推送提醒",
              on: true,
            },
            { label: "出貨期限提醒", desc: "48 小時內未發貨警示", on: true },
            {
              label: "商品價格波動",
              desc: "上架商品市價超出 ±10% 提醒",
              on: false,
            },
            {
              label: "平台公告",
              desc: "佣金費率與功能更新通知",
              on: false,
            },
          ].map(({ label, desc, on }) => (
            <div key={label} className={settingsListRowClass}>
              <div className="min-w-0 flex-1">
                <p className={SECTION_TITLE_CLASS}>
                  {label}
                </p>
                <p className="font-mono text-[10px] text-text-secondary truncate mt-0.5">
                  {desc}
                </p>
              </div>
              <button
                type="button"
                aria-label={`切換 ${label} 通知狀態`}
                className={cn(
                  "w-9 h-5 rounded-full flex items-center transition-colors shrink-0 cursor-pointer",
                  on
                    ? "bg-brand justify-end pr-0.5"
                    : "bg-bg-elevated justify-start pl-0.5",
                )}
              >
                <div className="w-4 h-4 rounded-full bg-[#17130f] shadow-sm" />
              </button>
            </div>
          ))}
        </SettingsSection>

        <SettingsSection id="session-ctrl" title="登出帳戶" variant="list">
          <LogoutModal variant="list" />
        </SettingsSection>
      </div>
    </div>
  );
}
