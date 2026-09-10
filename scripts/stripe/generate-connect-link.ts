import Stripe from 'stripe';

// 1. 環境變數強檢驗 (Environment Guard)
const secretKey = process.env.STRIPE_SECRET_KEY;

if (!secretKey) {
  console.error('\n❌ [Fatal Error]: 未能於 .env.local 或環境變數中找到 STRIPE_SECRET_KEY！');
  console.error('👉 請確保根目錄的 .env.local 包含：STRIPE_SECRET_KEY=sk_test_...\n');
  process.exit(1);
}

// 2. 初始化獨立 Stripe Client (避免 Path Alias 依賴)
const stripe = new Stripe(secretKey, {
  apiVersion: '2023-10-16' as Stripe.LatestApiVersion,
});

// 支持從 CLI 傳入 Target Account ID，否則使用預設 Sandbox 帳號
const targetAccountId = process.argv[2] || 'acct_1TyAhnRvaMcbJy1c';

console.log(`\n⏳ 正在與 Stripe 通訊，為帳戶 [${targetAccountId}] 建立 Onboarding 連結...`);

try {
  // 3. 使用 Top-Level Await 確保異步請求完全完成
  const link = await stripe.accountLinks.create({
    account: targetAccountId,
    refresh_url: 'https://example.com/reauth',
    return_url: 'https://example.com/return',
    type: 'account_onboarding',
  });

  console.log('\n================================================================');
  console.log('✅ 成功生成 Connect Express Onboarding 測試網址：');
  console.log(link.url);
  console.log('================================================================\n');
  console.log('👉 請複製上方網址至瀏覽器開啟，點擊頁面頂部的 "Fill with test data" 即可解鎖。\n');
} catch (error) {
  console.error('\n❌ [Stripe API 呼叫失敗]:');
  console.error(error instanceof Error ? error.message : error);
  console.error('\n');
  process.exit(1);
}