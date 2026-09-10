// scripts/reset-test-account.ts
import { stripe } from '../../lib/stripe';

async function createCleanTestMerchant() {
  try {
    console.log('⏳ 正在建立全新的 Stripe Express 測試商戶帳戶...');

    // 1. 建立乾淨的 Express 子帳戶 (不帶任何 phone 欄位)
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'HK',
      email: `test_merchant_${Date.now()}@cardvaulthk.com`,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_type: 'individual',
    });

    console.log(`✅ 成功建立新帳戶 ID: ${account.id}`);

    // 2. 生成 Account Link
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: 'https://example.com/reauth',
      return_url: 'https://example.com/return',
      type: 'account_onboarding',
    });

    console.log('\n================================================================');
    console.log('👉 請複製以下網址，並在「無痕視窗」中開啟：');
    console.log(accountLink.url);
    console.log('================================================================\n');
    console.log('💡 進入頁面後，點擊頂部的 "Use test code" 或 "Fill with test data" 即可秒解鎖，無需輸入任何電話驗證碼！\n');
  } catch (error) {
    console.error('❌ 建立失敗：', error instanceof Error ? error.message : error);
  }
}

createCleanTestMerchant();