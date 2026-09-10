"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  getPlatformFinancialConfig,
  updatePlatformFinancialConfig,
} from "@/app/actions/admin-settings";
import {
  getPlatformLegalForAdmin,
  updatePlatformLegal,
} from "@/app/actions/platform-legal";
import {
  BTN_OUTLINE_CLASS,
  BTN_PRIMARY_CLASS,
  FORM_INPUT_CLASS,
  FORM_LABEL_CLASS,
  FORM_SECTION_CLASS,
  FORM_TEXTAREA_CLASS,
} from "@/app/admin/campaigns/campaigns-ui";
import { LogoutModal } from "@/app/components/profile/LogoutModal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_PLATFORM_PRIVACY,
  DEFAULT_PLATFORM_TERMS,
} from "@/lib/platform/platform-legal-config";

const SETTINGS_SECTION_CLASS =
  "space-y-3 border-b border-white/[0.08] pb-4 last:border-b-0";

const INPUT_AFFIX_WRAPPER_CLASS =
  "flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-transparent px-3 focus-within:border-brand/40 focus-within:ring-2 focus-within:ring-brand/40";

const INPUT_AFFIX_FIELD_CLASS =
  "flex-1 border-0 bg-transparent px-0 font-mono text-[13px] text-text-primary shadow-none focus-visible:ring-0";

export function AdminSettingsClient({ authEmail }: { authEmail: string }) {
  const [commissionRate, setCommissionRate] = useState(8.0);
  const [isLoadingFinancials, setIsLoadingFinancials] = useState(true);
  const [isSavingFinancials, setIsSavingFinancials] = useState(false);
  const [appraisalFee, setAppraisalFee] = useState(150);

  const [termsTitle, setTermsTitle] = useState(DEFAULT_PLATFORM_TERMS.title);
  const [termsBody, setTermsBody] = useState(DEFAULT_PLATFORM_TERMS.body);
  const [privacyTitle, setPrivacyTitle] = useState(DEFAULT_PLATFORM_PRIVACY.title);
  const [privacyBody, setPrivacyBody] = useState(DEFAULT_PLATFORM_PRIVACY.body);
  const [isLoadingLegal, setIsLoadingLegal] = useState(true);
  const [isSavingLegal, setIsSavingLegal] = useState(false);

  const [adminEmail, setAdminEmail] = useState(authEmail);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    setAdminEmail(authEmail);
  }, [authEmail]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await getPlatformFinancialConfig();
      if (cancelled) {
        return;
      }

      if (result.success) {
        setCommissionRate(result.data.commissionRatePercent);
        setAppraisalFee(result.data.appraisalFeeHkd);
      } else {
        toast.error(result.error);
      }
      setIsLoadingFinancials(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await getPlatformLegalForAdmin();
      if (cancelled) {
        return;
      }

      if (result.success) {
        setTermsTitle(result.data.terms.title);
        setTermsBody(result.data.terms.body);
        setPrivacyTitle(result.data.privacy.title);
        setPrivacyBody(result.data.privacy.body);
      } else {
        toast.error(result.error);
      }
      setIsLoadingLegal(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaveFinancials = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingFinancials(true);

    const result = await updatePlatformFinancialConfig({
      commissionRatePercent: commissionRate,
      appraisalFeeHkd: appraisalFee,
    });
    setIsSavingFinancials(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    setCommissionRate(result.data.commissionRatePercent);
    setAppraisalFee(result.data.appraisalFeeHkd);
    toast.success(
      "平台財務設定已更新：新訂單結帳將套用新鑑定費；確認收貨後將套用新佣金率。",
    );
  };

  const handleSaveTerms = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingLegal(true);

    const result = await updatePlatformLegal({
      terms: { title: termsTitle, body: termsBody },
      privacy: { title: privacyTitle, body: privacyBody },
    });
    setIsSavingLegal(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    setTermsTitle(result.data.terms.title);
    setTermsBody(result.data.terms.body);
    setPrivacyTitle(result.data.privacy.title);
    setPrivacyBody(result.data.privacy.body);
    toast.success("平台聲明與交易條款已發佈，/terms 與 /privacy 已更新。");
  };

  const handleUpdateEmail = (e: React.FormEvent) => {
    e.preventDefault();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!adminEmail.trim() || !emailRegex.test(adminEmail.trim())) {
      toast.error("請輸入有效嘅電郵地址");
      return;
    }
    toast.success("管理員電郵已更新，請重新驗證身份。");
    setAdminEmail(authEmail);
  };

  const handleUpdatePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword) {
      toast.error("請輸入新密碼");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("密碼長度至少 8 個字元");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("兩次輸入嘅密碼唔一致");
      return;
    }
    toast.success("管理員密碼已更新，請重新驗證身份。");
    setNewPassword("");
    setConfirmPassword("");
  };

  return (
    <div className="space-y-5 pb-8">
      <header>
        <p className="font-sans text-[13px] text-text-secondary">
          管理員可調校平台核心佣金、鑑定費與管理員安全設定
        </p>
      </header>

      <div className="mx-auto max-w-3xl space-y-4">
        <section aria-labelledby="financials-heading" className={SETTINGS_SECTION_CLASS}>
          <div className="space-y-1">
            <h2 id="financials-heading" className={FORM_SECTION_CLASS}>
              核心財務與費用
            </h2>
            <p className="font-sans text-[11px] text-text-disabled">
              設定全平台抽佣比例與單張保管鑑定費用
            </p>
          </div>

          <form onSubmit={handleSaveFinancials} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="commission-rate" className={FORM_LABEL_CLASS}>
                  平台基本交易佣金率
                </Label>
                <div className={INPUT_AFFIX_WRAPPER_CLASS}>
                  <Input
                    id="commission-rate"
                    type="number"
                    value={commissionRate}
                    onChange={(e) =>
                      setCommissionRate(parseFloat(e.target.value))
                    }
                    min={1}
                    max={20}
                    step={0.1}
                    disabled={isLoadingFinancials || isSavingFinancials}
                    className={INPUT_AFFIX_FIELD_CLASS}
                  />
                  <span className="font-mono text-[11px] text-text-disabled">
                    %
                  </span>
                </div>
                <p className="font-mono text-[10px] text-text-disabled">
                  {isLoadingFinancials
                    ? "載入中…"
                    : `目前費率：${commissionRate.toFixed(1)}%`}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="appraisal-fee" className={FORM_LABEL_CLASS}>
                  單張卡牌保管鑑定費
                </Label>
                <div className={INPUT_AFFIX_WRAPPER_CLASS}>
                  <span className="font-mono text-[11px] text-text-disabled">
                    HK$
                  </span>
                  <Input
                    id="appraisal-fee"
                    type="number"
                    value={appraisalFee}
                    onChange={(e) => setAppraisalFee(parseInt(e.target.value, 10))}
                    min={50}
                    max={1000}
                    disabled={isLoadingFinancials || isSavingFinancials}
                    className={INPUT_AFFIX_FIELD_CLASS}
                  />
                </div>
                <p className="font-mono text-[10px] text-text-disabled">
                  包括保險與標準外殼
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoadingFinancials || isSavingFinancials}
              className={`${BTN_PRIMARY_CLASS} disabled:opacity-50 disabled:pointer-events-none`}
            >
              {isSavingFinancials ? "儲存中…" : "儲存財務設定"}
            </button>
          </form>
        </section>

        <section aria-labelledby="terms-heading" className={SETTINGS_SECTION_CLASS}>
          <div className="space-y-1">
            <h2 id="terms-heading" className={FORM_SECTION_CLASS}>
              平台聲明與條款
            </h2>
            <p className="font-sans text-[11px] text-text-disabled">
              編修前台服務條款與私隱政策；發佈後即時更新 /terms 與 /privacy
            </p>
          </div>

          <form onSubmit={handleSaveTerms} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="terms-body" className={FORM_LABEL_CLASS}>
                服務條款
              </Label>
              <textarea
                id="terms-body"
                name="termsBody"
                value={termsBody}
                onChange={(e) => setTermsBody(e.target.value)}
                disabled={isLoadingLegal || isSavingLegal}
                className={FORM_TEXTAREA_CLASS}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="privacy-body" className={FORM_LABEL_CLASS}>
                私隱政策
              </Label>
              <textarea
                id="privacy-body"
                name="privacyBody"
                value={privacyBody}
                onChange={(e) => setPrivacyBody(e.target.value)}
                disabled={isLoadingLegal || isSavingLegal}
                className={FORM_TEXTAREA_CLASS}
              />
            </div>

            <button
              type="submit"
              disabled={isLoadingLegal || isSavingLegal}
              className={`${BTN_PRIMARY_CLASS} disabled:opacity-50 disabled:pointer-events-none`}
            >
              {isSavingLegal ? "發佈中…" : "發佈最新條款聲明"}
            </button>
          </form>
        </section>

        <section
          aria-labelledby="auth-settings-heading"
          className={SETTINGS_SECTION_CLASS}
        >
          <div className="space-y-1">
            <h2 id="auth-settings-heading" className={FORM_SECTION_CLASS}>
              安全設定
            </h2>
            <p className="font-sans text-[11px] text-text-disabled">
              更新管理員登入電郵與密碼，變更後需重新驗證身份
            </p>
          </div>

          <div className="space-y-5">
            <form onSubmit={handleUpdateEmail} className="space-y-2">
              <Label htmlFor="admin-email" className={FORM_LABEL_CLASS}>
                管理員電郵
              </Label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  id="admin-email"
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  className={`${FORM_INPUT_CLASS} sm:flex-1`}
                />
                <button type="submit" className={`${BTN_OUTLINE_CLASS} shrink-0`}>
                  更新電郵
                </button>
              </div>
            </form>

            <form onSubmit={handleUpdatePassword} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="new-password" className={FORM_LABEL_CLASS}>
                    新密碼
                  </Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="輸入新密碼"
                    className={FORM_INPUT_CLASS}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password" className={FORM_LABEL_CLASS}>
                    確認新密碼
                  </Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="再次輸入新密碼"
                    className={FORM_INPUT_CLASS}
                  />
                </div>
              </div>
              <button type="submit" className={BTN_PRIMARY_CLASS}>
                更新密碼
              </button>
            </form>
          </div>
        </section>

        <section aria-labelledby="session-ctrl-heading" className={SETTINGS_SECTION_CLASS}>
          <div className="space-y-1">
            <h2 id="session-ctrl-heading" className={FORM_SECTION_CLASS}>
              會話控制
            </h2>
            <p className="font-sans text-[11px] text-text-disabled">
              管理員身份鑑權與登出
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-sans text-[12px] text-text-secondary">
              您目前是以安全最高權限組管理員 (Super Admin) 登入。
            </p>
            <div className="shrink-0">
              <LogoutModal />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
