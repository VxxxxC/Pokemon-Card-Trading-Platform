export const P2P_NEW_ACCOUNT_GRACE_DAYS = 14;
export const P2P_MEETUP_MAX_NEW_ACCOUNT_HKD = 300;
export const P2P_MEETUP_MAX_NO_MARKET_PRICE_HKD = 800;

export function resolveP2pNewAccountGraceDays(): number {
  return P2P_NEW_ACCOUNT_GRACE_DAYS;
}

export function resolveP2pMeetupMaxNewAccountHkd(): number {
  return P2P_MEETUP_MAX_NEW_ACCOUNT_HKD;
}

export function resolveP2pMeetupMaxNoMarketPriceHkd(): number {
  return P2P_MEETUP_MAX_NO_MARKET_PRICE_HKD;
}

export function buildP2pMeetupNewAccountCapErrorMessage(
  graceDays: number = resolveP2pNewAccountGraceDays(),
  maxHkd: number = resolveP2pMeetupMaxNewAccountHkd(),
): string {
  return `新註冊帳號（${graceDays} 天內）面交單筆上限為 HK$${maxHkd}，請降低出價或選用平台鑑定託管。`;
}

export function buildP2pMeetupNoMarketPriceCapErrorMessage(
  maxHkd: number = resolveP2pMeetupMaxNoMarketPriceHkd(),
): string {
  return `此卡牌無市場參考價，超過 HK$${maxHkd} 的面交出價必須啟用平台鑑定託管服務。`;
}
