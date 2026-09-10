import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is missing from environment variables.');
}

/**
 * 集中式 Stripe Client 實例
 * 透過 as any 斷言固定 2023-10-16 API 版本，避免 SDK 型別升級導致 TS2322 錯誤
 */
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16' as Stripe.LatestApiVersion,
  typescript: true,
  appInfo: {
    name: 'HKCardVault',
    version: '1.0.0',
  },
});