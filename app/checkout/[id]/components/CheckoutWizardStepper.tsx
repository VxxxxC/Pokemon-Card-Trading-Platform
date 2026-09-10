"use client";

import { CHECKOUT_VARIANT_CONFIG } from "@/lib/checkout/variant-config";
import type { CheckoutVariant } from "@/lib/checkout/types";
import { cn } from "@/lib/utils";

type CheckoutWizardStepperProps = {
  variant: CheckoutVariant;
  step: 1 | 2;
};

export function CheckoutWizardStepper({
  variant,
  step,
}: CheckoutWizardStepperProps) {
  const config = CHECKOUT_VARIANT_CONFIG[variant];
  const steps = [config.step1Title, config.step2Title];

  return (
    <ol className="flex items-center gap-2 font-sans text-[12px]">
      {steps.map((label, index) => {
        const stepNumber = (index + 1) as 1 | 2;
        const isActive = step === stepNumber;
        const isCompleted = step > stepNumber;

        return (
          <li key={label} className="flex items-center gap-2">
            {index > 0 ? (
              <span className="text-text-disabled" aria-hidden="true">
                →
              </span>
            ) : null}
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1",
                isActive
                  ? "border-brand/40 bg-brand/10 text-brand"
                  : isCompleted
                    ? "border-success/30 bg-success/10 text-success"
                    : "border-white/10 bg-[#17130f] text-text-disabled",
              )}
            >
              <span className="font-mono text-[10px]">{stepNumber}</span>
              <span className="font-semibold">{label}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
