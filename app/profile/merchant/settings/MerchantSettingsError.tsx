import Link from "next/link";
import { SECTION_TITLE_CLASS } from "@/lib/ui/section-title-ui";

type Props = {
  message: string;
};

export function MerchantSettingsError({ message }: Props) {
  return (
    <section
      className="rounded-xl overflow-hidden bg-bg-card border border-[rgba(237,232,224,0.08)] animate-fadeIn"
      aria-labelledby="settings-error-heading"
    >
      <div className="px-3 py-2.5 sm:px-4 border-b border-[rgba(237,232,224,0.06)]">
        <h2
          id="settings-error-heading"
          className={SECTION_TITLE_CLASS}
        >
          無法載入店舖設定
        </h2>
      </div>
      <div className="p-3.5 sm:p-4 space-y-4">
        <p className="font-sans text-[13px] text-text-secondary">{message}</p>
        <Link
          href="/profile/merchant"
          className="inline-flex h-10 px-4 items-center bg-brand text-[#17130f] font-sans font-semibold text-[13px] rounded-lg hover:bg-brand-hover transition-colors"
        >
          返回商戶總覽
        </Link>
      </div>
    </section>
  );
}
