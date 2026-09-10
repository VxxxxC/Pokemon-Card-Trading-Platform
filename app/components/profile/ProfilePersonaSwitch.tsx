"use client";

import { useRouter } from "next/navigation";
import type { DualPersonaContext } from "@/lib/auth/dual-persona";
import { useUIStore } from "@/app/store/useUIStore";
import { cn } from "@/lib/utils";

type ProfilePersonaSwitchProps = {
  activeContext: "member" | "merchant";
  context: DualPersonaContext;
  className?: string;
};

function resolveTargetLabel(
  activeContext: "member" | "merchant",
  context: DualPersonaContext,
): string {
  if (activeContext === "member") {
    return context.shopName ?? context.shopHandle ?? "商戶身份";
  }

  return (
    context.memberDisplayName ??
    context.memberUsername ??
    "會員身份"
  );
}

export function ProfilePersonaSwitch({
  activeContext,
  context,
  className = "",
}: ProfilePersonaSwitchProps) {
  const router = useRouter();
  const setActiveListingPersona = useUIStore(
    (state) => state.setActiveListingPersona,
  );

  if (!context.hasDualPersona) {
    return null;
  }

  const targetHref =
    activeContext === "member" ? "/profile/merchant" : "/profile/user";
  const targetPersona = activeContext === "member" ? "merchant" : "member";
  const actionLabel =
    activeContext === "member" ? "切換至商戶身份" : "切換至會員身份";
  const targetLabel = resolveTargetLabel(activeContext, context);

  return (
    <button
      type="button"
      onClick={() => {
        setActiveListingPersona(targetPersona);
        router.push(targetHref);
      }}
      className={cn(
        "font-mono text-[10px] text-text-secondary hover:text-brand transition-colors focus:outline-none",
        className,
      )}
      title={`${actionLabel}：${targetLabel}`}
    >
      {actionLabel} →
    </button>
  );
}
