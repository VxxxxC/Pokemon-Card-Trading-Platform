"use client";

import {
  useState,
  useEffect,
  useCallback,
  startTransition,
  useActionState,
} from "react";
import Link from "next/link";
// 🟢 核心引入：加裝 useSearchParams 捕捉大盤外部跳轉載荷
import { useRouter, useSearchParams } from "next/navigation";
import {
  login,
  registerAccount,
} from "@/app/actions/auth";
import { validateRegisterFields } from "@/lib/auth/validation";

type Tab = "login" | "register";

type FormErrors = Record<string, string>;

function inputClass(hasError: boolean): string {
  return [
    "w-full h-10 px-3 rounded-lg",
    "bg-bg-card font-sans text-[13px] text-text-primary placeholder:text-text-disabled",
    "border outline-none transition-shadow",
    hasError
      ? "border-warning focus:ring-2 focus:ring-[rgba(239,68,68,0.30)]"
      : "border-[rgba(237,232,224,0.12)] focus:ring-2 focus:ring-[rgba(140,115,85,0.40)] focus:border-[rgba(212,165,116,0.40)]",
  ].join(" ");
}

function Checkbox({
  checked,
  hasError,
  onChange,
}: {
  checked: boolean;
  hasError?: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onChange}
      className={[
        "w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors",
        checked
          ? "bg-brand border-brand"
          : hasError
            ? "bg-transparent border-warning"
            : "bg-transparent border-[rgba(237,232,224,0.25)] hover:border-brand",
      ].join(" ")}
    >
      {checked && (
        <svg
          width="10"
          height="8"
          viewBox="0 0 10 8"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M1 4L3.5 6.5L9 1"
            stroke="#17130f"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}

function EyeIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function Field({
  label,
  error,
  children,
  labelRight,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  labelRight?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="font-mono text-[10px] text-text-secondary">
          {label}
        </label>
        {labelRight}
      </div>
      {children}
      {error && (
        <p className="mt-1 font-sans text-[12px] text-warning">{error}</p>
      )}
    </div>
  );
}

function PasswordInput({
  name,
  placeholder,
  autoComplete,
  hasError,
  showPassword,
  onToggleShow,
}: {
  name: string;
  placeholder?: string;
  autoComplete: string;
  hasError: boolean;
  showPassword: boolean;
  onToggleShow: () => void;
}) {
  return (
    <div className="relative">
      <input
        type={showPassword ? "text" : "password"}
        name={name}
        autoComplete={autoComplete}
        placeholder={placeholder ?? "••••••••"}
        className={inputClass(hasError) + " pr-11"}
      />
      <button
        type="button"
        onClick={onToggleShow}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-text-disabled hover:text-text-secondary transition-colors focus:outline-none"
        aria-label={showPassword ? "隱藏密碼" : "顯示密碼"}
      >
        {showPassword ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

export function AuthForm() {
  const router = useRouter();
  // 🟢 接入 Next.js 16 搜尋參數解碼器
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<Tab>("login");
  const [showPassword, setShowPassword] = useState(false);

  // ── 🟢 React 19 原生表單動作架構：本地僅保留純 UI 互動旗標，文字載荷全數交由原生 FormData 託管 ──
  const [remember, setRemember] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [isMerchant, setIsMerchant] = useState(
    () => searchParams?.get("role") === "merchant",
  );
  const [registerEmail, setRegisterEmail] = useState("");

  // ── 🟢 核心狀態加裝：商戶審批成功攔截看板 ──
  const [isMerchantSubmitted, setIsMerchantSubmitted] = useState(false);
  const [authCallbackNotice, setAuthCallbackNotice] = useState<string | null>(
    null,
  );

  // ── 🟢 終極破局：網址參數雷達自動追蹤與切換 ──
  useEffect(() => {
    if (!searchParams) return;
    const role = searchParams.get("role");
    const error = searchParams.get("error");
    const email = searchParams.get("email");

    if (error === "auth_callback_expired") {
      startTransition(() => {
        setAuthCallbackNotice(
          "驗證連結已失效或已使用，請重新寄送驗證信或登入。",
        );
        if (email) {
          setRegisterEmail(email);
          setTab("register");
        }
      });
      return;
    }

    if (error === "auth_callback") {
      startTransition(() => {
        setAuthCallbackNotice(
          "無法完成電郵驗證。請用 http://127.0.0.1:3000 開啟網站後重試，或重新寄送驗證信。",
        );
        if (email) {
          setRegisterEmail(email);
        }
      });
      return;
    }

    startTransition(() => {
      setAuthCallbackNotice(null);
    });

    // 商戶深連結：切換至註冊並進入商戶入駐模式
    if (role === "merchant") {
      startTransition(() => {
        setTab("register");
        setIsMerchant(true);
      });
    }
  }, [searchParams]);

  // ── 🟢 React 19 useActionState：登入提交管線（Supabase signInWithPassword）──
  const [loginErrors, loginAction, isLoginPending] = useActionState(
    login,
    null,
  );

  // ── 🟢 React 19 useActionState：註冊提交分流管線（會員 → Supabase；商戶 → 審批攔截）──
  const [registerErrors, registerAction, isRegisterPending] = useActionState<
    FormErrors | null,
    FormData
  >(async (prev, formData) => {
    const fields = {
      email: ((formData.get("email") as string | null) ?? "").trim(),
      password: (formData.get("password") as string | null) ?? "",
      confirmPassword: (formData.get("confirmPassword") as string | null) ?? "",
      agreeTerms: formData.get("agreeTerms") === "true",
    };

    setRegisterEmail(fields.email);
    setAgreeTerms(fields.agreeTerms);

    const validationErrors = validateRegisterFields(fields);
    if (Object.keys(validationErrors).length) return validationErrors;

    return registerAccount(prev, formData);
  }, null);

  // 派生錯誤源：依當前分頁直接讀取對應 Action 回傳的錯誤快照
  const errors: FormErrors =
    (tab === "login" ? loginErrors : registerErrors) ?? {};

  const handleTabChange = useCallback(
    (next: Tab) => {
      setTab(next);
      setShowPassword(false);
      if (next === "login") {
        setIsMerchant(false);
        if (searchParams?.get("role") === "merchant") {
          router.replace("/auth", { scroll: false });
        }
      } else {
        setIsMerchant(searchParams?.get("role") === "merchant");
      }
    },
    [router, searchParams],
  );

  const enterMerchantRegister = useCallback(() => {
    setTab("register");
    setIsMerchant(true);
    router.replace("/auth?role=merchant", { scroll: false });
  }, [router]);

  const enterMemberRegister = useCallback(() => {
    setIsMerchant(false);
    router.replace("/auth", { scroll: false });
  }, [router]);

  const toggleShow = useCallback(() => setShowPassword((v) => !v), []);

  // ── 🟢 核心優化：商戶審批等待提示畫面 ──
  if (isMerchantSubmitted) {
    return (
      <div className="bg-[#26211C] border border-[rgba(212,165,116,0.25)] rounded-2xl p-6 text-left shadow-2xl space-y-4 animate-scaleUp">
        <div className="flex items-center gap-2 border-b border-white/5 pb-3">
          <span className="text-[20px]">🏛️</span>
          <h2 className="font-sans font-black text-[17px] text-[#eae1da]">
            認證商戶註冊申請已成功提交
          </h2>
        </div>
        <p className="font-sans text-[13px] text-[#d4c4b7] leading-relaxed">
          平台管理員已收到您的入駐要約申請。由於認證商戶具備開啟私域散件櫥窗、發布大盤出讓及免手續費等高級特權，風控官將於{" "}
          <span className="text-brand font-bold">24 小時內</span> 完成人工初審。
        </p>
        <div className="p-3.5 bg-[#17130f] rounded-xl border border-white/5 font-sans text-[12.5px] text-[#8A8680] leading-relaxed">
          💡 <span className="text-[#eae1da] font-semibold">後續流程：</span>
          審批通過後，系統將自動向您的郵箱發送官方{" "}
          <span className="text-brand font-medium">
            Merchant Account Approved
          </span>{" "}
          核准認證電郵，並附加一串加密的
          <span className="text-[#eae1da] font-semibold">
            一次性憑證 URL
          </span>{" "}
          供您直接進行首次安全登入。
        </div>
        <button
          type="button"
          onClick={() => {
            setIsMerchantSubmitted(false);
            handleTabChange("login");
          }}
          className="w-full h-11 bg-brand hover:bg-brand-hover text-[#17130f] font-sans text-[14px] font-black rounded-xl cursor-pointer transition-colors focus:outline-none"
        >
          返回登入主頁
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="shrink-0">
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-4 -ml-1 w-8 h-8 rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-elevated active:scale-95 transition-all focus:outline-none"
          aria-label="返回上一頁"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="mb-5">
          <h1 className="font-sans text-[22px] sm:text-[24px] font-bold text-text-primary leading-tight">
            {tab === "login"
              ? "歡迎回來"
              : isMerchant
                ? "商戶入駐申請"
                : "建立帳戶"}
          </h1>
          <p className="mt-1 font-sans text-[13px] text-text-secondary leading-relaxed">
            {tab === "login"
              ? "登入以查看您的卡牌收藏與交易記錄"
              : isMerchant
                ? "建立帳戶後將引導您完成商戶 KYC 認證"
                : "加入 HKCardVault，開始交易日版精選卡牌"}
          </p>
        </div>

        <div className="relative flex bg-bg-card rounded-lg p-1 mb-5 border border-[rgba(237,232,224,0.08)]">
          <div
            className="absolute top-1 bottom-1 rounded-md bg-[rgba(212,165,116,0.14)] border border-[rgba(212,165,116,0.22)] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] pointer-events-none"
            style={{
              width: "calc(50% - 4px)",
              transform:
                tab === "login"
                  ? "translateX(0)"
                  : "translateX(calc(100% + 4px))",
            }}
          />
          <button
            type="button"
            onClick={() => handleTabChange("login")}
            className={`relative flex-1 h-8 font-sans text-[13px] font-medium rounded-md transition-colors z-10 ${tab === "login" ? "text-brand" : "text-text-secondary hover:text-text-primary"}`}
          >
            登入
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("register")}
            className={`relative flex-1 h-8 font-sans text-[13px] font-medium rounded-md transition-colors z-10 ${tab === "register" ? "text-brand" : "text-text-secondary hover:text-text-primary"}`}
          >
            免費註冊
          </button>
        </div>

        {authCallbackNotice ? (
          <p className="mb-4 font-sans text-[12px] text-warning leading-relaxed">
            {authCallbackNotice}
          </p>
        ) : null}
      </div>

      {/* ── Login form ─────────────────────────────────────────────────────── */}
      {tab === "login" && (
        <form action={loginAction} noValidate className="space-y-3">
          <Field label="電子郵件" error={errors.email}>
            <input
              type="email"
              name="email"
              autoComplete="email"
              placeholder="your@email.com"
              className={inputClass(!!errors.email)}
            />
          </Field>
          <Field
            label="密碼"
            error={errors.password}
            labelRight={
              <Link
                href="/auth/forgot-password"
                className="font-sans text-[12px] text-brand hover:text-brand-hover transition-colors"
              >
                忘記密碼？
              </Link>
            }
          >
            <PasswordInput
              name="password"
              autoComplete="current-password"
              hasError={!!errors.password}
              showPassword={showPassword}
              onToggleShow={toggleShow}
            />
          </Field>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={remember}
              onChange={() => setRemember((v) => !v)}
            />
            <span className="font-sans text-[12px] text-text-secondary select-none">
              記住我
            </span>
          </div>
          <button
            type="submit"
            disabled={isLoginPending}
            className="w-full h-10 mt-1 rounded-lg bg-brand font-sans text-[14px] font-semibold text-[#17130f] hover:bg-brand-hover active:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoginPending ? "登入中…" : "登入"}
          </button>
        </form>
      )}

      {/* ── Register form ──────────────────────────────────────────────────── */}
      {tab === "register" && (
        <form action={registerAction} noValidate className="space-y-3">
          <input
            type="hidden"
            name="agreeTerms"
            value={agreeTerms ? "true" : "false"}
          />
          <input
            type="hidden"
            name="isMerchant"
            value={isMerchant ? "true" : "false"}
          />

          <Field label="電子郵件" error={errors.email}>
            <input
              type="email"
              name="email"
              autoComplete="email"
              placeholder="your@email.com"
              value={registerEmail}
              onChange={(e) => setRegisterEmail(e.target.value)}
              className={inputClass(!!errors.email)}
            />
          </Field>
          <Field label="密碼" error={errors.password}>
            <PasswordInput
              name="password"
              autoComplete="new-password"
              placeholder="••••••••（必須包含大小寫英數及符號）"
              hasError={!!errors.password}
              showPassword={showPassword}
              onToggleShow={toggleShow}
            />
          </Field>
          <Field label="確認密碼" error={errors.confirmPassword}>
            <PasswordInput
              name="confirmPassword"
              autoComplete="new-password"
              hasError={!!errors.confirmPassword}
              showPassword={showPassword}
              onToggleShow={toggleShow}
            />
          </Field>
          <div>
            <div className="flex items-start gap-2">
              <div className="mt-0.5">
                <Checkbox
                  checked={agreeTerms}
                  hasError={!!errors.agreeTerms}
                  onChange={() => setAgreeTerms((v) => !v)}
                />
              </div>
              <span className="font-sans text-[13px] text-text-secondary leading-relaxed">
                我已閱讀並同意{" "}
                <Link
                  href="/terms"
                  className="text-brand hover:text-brand-hover underline-offset-2 hover:underline transition-colors"
                >
                  服務條款
                </Link>{" "}
                及{" "}
                <Link
                  href="/privacy"
                  className="text-brand hover:text-brand-hover underline-offset-2 hover:underline transition-colors"
                >
                  私隱政策
                </Link>
              </span>
            </div>
            {errors.agreeTerms && (
              <p className="mt-1 pl-6 font-sans text-[12px] text-warning">
                {errors.agreeTerms}
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={isRegisterPending}
            className="w-full h-10 mt-1 rounded-lg bg-brand font-sans text-[14px] font-semibold text-[#17130f] hover:bg-brand-hover active:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRegisterPending
              ? "建立中…"
              : isMerchant
                ? "提交商戶入駐申請"
                : "免費建立帳戶"}
          </button>
          <p className="pt-2 text-center">
            {isMerchant ? (
              <button
                type="button"
                onClick={enterMemberRegister}
                className="font-sans text-[12px] text-text-secondary hover:text-text-primary transition-colors"
              >
                改為一般會員註冊
              </button>
            ) : (
              <button
                type="button"
                onClick={enterMerchantRegister}
                className="font-sans text-[12px] text-brand hover:text-brand-hover transition-colors"
              >
                想開店？申請認證商戶 →
              </button>
            )}
          </p>
        </form>
      )}

      <p className="mt-auto pt-6 text-center font-mono text-[10px] text-text-disabled">
        © 2026 HKCardVault · 所有交易受平台監管保障
      </p>
    </div>
  );
}
