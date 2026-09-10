# Supabase Auth 郵件模板

與 App 共用 **`lib/email/layout.ts`** 品牌 layout（暗金 header + 金色 CTA）。

## 重要：為何仍收到 Supabase 預設模板？

`supabase/templates/auth/*.html` **只存在 repo**，不會自動套用到 hosted project。

你只設了 **SMTP（Resend）** → 郵件從 `noreply@notify.cardvaulthk.com` 寄出，但 **HTML 仍是 Dashboard 裡的預設內容**，直到你：

1. **Dashboard 手動貼上**（最快），或
2. **`bunx supabase config push`**（已寫入 `supabase/config.toml`）

## 生成 / 更新模板

```bash
bun run email:generate-auth-templates
```

輸出至 `supabase/templates/auth/`：

| 檔案 | Supabase Dashboard 位置 |
|------|-------------------------|
| `confirm-signup.*` | Authentication → Email Templates → **Confirm signup** |
| `reset-password.*` | **Reset password** |
| `magic-link.*` | **Magic link**（若啟用） |
| `change-email.*` | **Change email address** |

每組包含 `.subject.txt`、`.html`、`.txt`（plain text 備用）。

## 方法一：Dashboard 貼上（推薦首次）

1. Supabase Dashboard → **Authentication** → **Email Templates**
2. 點 **Confirm signup**（不是 SMTP settings 頁）
3. **Subject** ← `confirm-signup.subject.txt`
4. **Body (HTML)** ← `confirm-signup.html` **全文**（从 `<!DOCTYPE` 到 `</html>`）
5. 点 **Save**
6. **再注册一次**（旧邮件不会变，必须新发）

`Reset password` 等同贴 `reset-password.*`。

## 方法二：CLI push（慎用）

`supabase/config.toml` 已配置模板路径，但 **`config push` 会同步整份 auth 配置**（Site URL、密码规则等），可能覆盖线上设定。推送前务必看 diff。

```bash
bun run email:generate-auth-templates
bunx supabase config push   # 若 storage 402 失败，auth 可能已部分更新；以 Dashboard 为准
```

**首次建议只用方法一。**

## 前置设定

| 设定 | 值 |
|------|-----|
| **Confirm email** | **必须开启**（Authentication → Providers → Email） |
| SMTP Host | `smtp.resend.com` |
| Sender | `noreply@notify.cardvaulthk.com` |
| Sender name | `Cardvault HK` |
| Site URL | 正式域名（logo 用 `{{ .SiteURL }}/asset/logo.png`） |
| Redirect URLs | `https://<domain>/auth/callback` · 本地另加 `http://127.0.0.1:3000/auth/callback` 同 `http://localhost:3000/auth/callback` |

若 confirm link 仍是 `/?code=...` 或 `auth?error=auth_callback`：

1. **Supabase Site URL** 設 `http://127.0.0.1:3000`（唔好用 `0.0.0.0`）
2. **Redirect URLs** 加 `http://127.0.0.1:3000/auth/callback`
3. **重新貼** 模板 HTML（用 `token_hash` 直連 `/auth/callback`；**唔用** `{{ .ConfirmationURL }}` / `supabase.co/auth/v1/verify`）
4. 瀏覽器用 **http://127.0.0.1:3000** 開站（唔用 `0.0.0.0`）

**正確連結格式（SSR + PKCE）：**

- 註冊：`http://127.0.0.1:3000/auth/callback?token_hash=pkce_...&type=signup&next=/profile/user`
- 重設密碼：`http://127.0.0.1:3000/auth/callback?token_hash=pkce_...&type=recovery&next=/auth/forgot-password/complete`

`pkce_` token 必須由 app callback 呼叫 `verifyOtp`（唔係 `exchangeCodeForSession`）。

## 进 Spam 箱？

**不全是 `noreply@` 的错**，但会有一点影响。常见原因：

| 因素 | 说明 |
|------|------|
| **新域名** | `notify.cardvaulthk.com` 无发送历史，信誉低 |
| **DKIM / SPF** | Resend Domains 须全绿；发件域与 Resend 验证域一致 |
| **DMARC** | Resend 会提示 DNS 记录，务必加齐 |
| **默认模板** | 英文 generic + 新域 → 更像钓鱼 |
| **`noreply@`** | 不能回复，部分过滤器略降权；可改 `hello@` + Reply-To `support@...` |

### 改善建议

1. Resend → Domains → `notify.cardvaulthk.com` 确认 **Verified**
2. 贴上 **品牌 HTML**（本模板）
3. 发件可改为 `hello@notify.cardvaulthk.com`，Reply-To 设客服邮箱
4. 测试时把邮件标「非垃圾」；随发送量信誉会升
5. 避免只有 HTML 无 plain text（我们 `.txt` 可贴到 Dashboard 若支持）

`noreply@` 业界仍常用；进 spam 多半是 **新域 + 认证未齐 + 默认模板**，不是单纯前缀。

## Layout 预览

```
┌─ 外層暖米色 #f0ebe4 ─────────────────────┐
│  ┌─ 白卡 #fff ────────────────────────┐  │
│  │ [暗金 header #1a1612 + logo]        │  │
│  │ 标题 + 正文 + 金色 CTA              │  │
│  │ footer 灰字                         │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

## 验证 confirm email

1. **Save 模板后**用新邮箱注册
2. 会员：主题「確認你的 Cardvault HK 帳戶」、暗金 header、CTA「確認電郵」→ `next=/profile/user`
3. 商戶（`/auth?role=merchant`）：主题「確認電郵 — 開始商戶入駐 · Cardvault HK」、强调櫥窗 / Stripe / B2C 訂單、CTA「確認電郵並繼續入駐」→ `next=/profile/user/merchant-apply`
4. 模板依 `user_metadata.onboarding_intent = merchant_apply`（注册时由 `registerMemberForMerchantApply` 写入）自动分支
5. 点 CTA → `/auth/callback` → 登录成功
