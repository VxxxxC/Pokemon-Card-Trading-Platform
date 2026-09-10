"use client";

import { useActionState } from "react";
import { resendSignupConfirmationEmail } from "@/app/actions/auth";
import { AuthFormShell } from "@/app/auth/AuthFormShell";

type ConfirmEmailPendingFormProps = {
  email: string;
  nextPath?: string;
};

export function ConfirmEmailPendingForm({
  email,
  nextPath,
}: ConfirmEmailPendingFormProps) {
  const [state, formAction, pending] = useActionState(
    resendSignupConfirmationEmail,
    null,
  );

  return (
    <AuthFormShell
      title="請確認你的電郵"
      description="我們已寄出驗證信。確認後即可登入並使用會員功能。"
      backHref="/auth"
      backLabel="返回登入"
    >
      <div className="px-3.5 py-4 sm:px-4 space-y-4">
        <p className="font-sans text-[13px] text-text-secondary leading-relaxed">
          驗證信已寄至{" "}
          <span className="text-text-primary font-medium">{email}</span>
          。請檢查收件匣及垃圾郵件資料夾。
        </p>

        {state?.status === "sent" ? (
          <p className="font-sans text-[13px] text-success">
            已重新寄出驗證信，請稍候查收。
          </p>
        ) : null}

        {state?.status === "error" ? (
          <p className="font-sans text-[13px] text-warning">
            {state.message}
          </p>
        ) : null}

        <form action={formAction} className="space-y-3">
          <input type="hidden" name="email" value={email} />
          {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
          <button
            type="submit"
            disabled={pending}
            className="w-full h-10 rounded-lg bg-brand text-[#17130f] font-sans text-[13px] font-semibold hover:bg-brand-hover transition-colors disabled:opacity-60"
          >
            {pending ? "寄送中…" : "重新寄送驗證信"}
          </button>
        </form>
      </div>
    </AuthFormShell>
  );
}
