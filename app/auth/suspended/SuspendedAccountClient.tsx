"use client";

import { logout } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

export function SuspendedAccountClient() {
  return (
    <div className="space-y-4">
      <p className="font-sans text-[13px] leading-relaxed text-[#d4c4b7]">
        您仍可登出並使用其他帳戶登入。若認為此限制有誤，請透過客服渠道申訴。
      </p>
      <form action={logout}>
        <Button
          type="submit"
          className="h-11 w-full bg-[#d4a574] text-[#111] hover:bg-[#e0b585]"
        >
          登出並返回登入
        </Button>
      </form>
    </div>
  );
}
