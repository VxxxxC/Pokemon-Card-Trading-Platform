import { describe, expect, it } from "vitest";
import {
  buildP2pMeetupNewAccountCapErrorMessage,
  buildP2pMeetupNoMarketPriceCapErrorMessage,
  P2P_MEETUP_MAX_NEW_ACCOUNT_HKD,
  P2P_MEETUP_MAX_NO_MARKET_PRICE_HKD,
  P2P_NEW_ACCOUNT_GRACE_DAYS,
  resolveP2pMeetupMaxNewAccountHkd,
  resolveP2pMeetupMaxNoMarketPriceHkd,
  resolveP2pNewAccountGraceDays,
} from "@/lib/platform/p2p-aml-config";

describe("p2p-aml-config", () => {
  it("resolve helpers return default constants", () => {
    expect(resolveP2pNewAccountGraceDays()).toBe(P2P_NEW_ACCOUNT_GRACE_DAYS);
    expect(resolveP2pMeetupMaxNewAccountHkd()).toBe(
      P2P_MEETUP_MAX_NEW_ACCOUNT_HKD,
    );
    expect(resolveP2pMeetupMaxNoMarketPriceHkd()).toBe(
      P2P_MEETUP_MAX_NO_MARKET_PRICE_HKD,
    );
    expect(P2P_NEW_ACCOUNT_GRACE_DAYS).toBe(14);
    expect(P2P_MEETUP_MAX_NEW_ACCOUNT_HKD).toBe(300);
    expect(P2P_MEETUP_MAX_NO_MARKET_PRICE_HKD).toBe(800);
  });

  it("buildP2pMeetupNewAccountCapErrorMessage matches legacy copy", () => {
    expect(buildP2pMeetupNewAccountCapErrorMessage()).toBe(
      "新註冊帳號（14 天內）面交單筆上限為 HK$300，請降低出價或選用平台鑑定託管。",
    );
  });

  it("buildP2pMeetupNoMarketPriceCapErrorMessage matches legacy copy", () => {
    expect(buildP2pMeetupNoMarketPriceCapErrorMessage()).toBe(
      "此卡牌無市場參考價，超過 HK$800 的面交出價必須啟用平台鑑定託管服務。",
    );
  });
});
