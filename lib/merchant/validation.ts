import {
  parseShippingFeeInput,
  validateShopBaseCourierShippingFee,
} from "@/lib/merchant/shipping-fee";

const SHOP_HANDLE_REGEX = /^[A-Za-z0-9_\-]{3,24}$/;

export type MerchantShopFormErrors = Record<string, string>;

export function validateMerchantShopFields(fields: {
  shopName: string;
  shopHandle: string;
  shopDescription: string;
  baseCourierShippingFee?: string;
}): MerchantShopFormErrors {
  const errors: MerchantShopFormErrors = {};
  const shopName = fields.shopName.trim();
  const shopHandle = fields.shopHandle.trim();
  const shopDescription = fields.shopDescription.trim();

  if (!shopName) {
    errors.shopName = "請輸入店舖名稱";
  }

  if (shopHandle && !SHOP_HANDLE_REGEX.test(shopHandle)) {
    errors.shopHandle =
      "店舖帳號限 3-24 字元，且只可包含英文、數字、底線(_)或連字號(-)";
  }

  if (shopDescription.length > 280) {
    errors.shopDescription = "店舖簡介不可超過 280 字元";
  }

  if (fields.baseCourierShippingFee !== undefined) {
    const parsed = parseShippingFeeInput(fields.baseCourierShippingFee);
    if (!parsed.ok) {
      errors.baseCourierShippingFee = parsed.error;
    } else {
      const feeError = validateShopBaseCourierShippingFee(parsed.amount);
      if (feeError) {
        errors.baseCourierShippingFee = feeError;
      }
    }
  }

  return errors;
}
