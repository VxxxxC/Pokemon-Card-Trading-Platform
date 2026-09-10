export const DEFAULT_FPS_MANUAL_TRANSFER_FEE_HKD = 0;

export function resolveFpsManualTransferFeeHkd(): number {
  return DEFAULT_FPS_MANUAL_TRANSFER_FEE_HKD;
}

export function computeFpsGrossPayoutHkd(
  itemSubtotal: number,
  inboundShippingFee = 0,
): number {
  const item = Number(itemSubtotal);
  const inbound = Number(inboundShippingFee);
  if (!Number.isFinite(item) || item < 0) {
    return 0;
  }
  if (!Number.isFinite(inbound) || inbound < 0) {
    return item;
  }
  return item + inbound;
}

export function computeFpsNetPayoutAmount(
  grossHkd: number,
  feeHkd: number = resolveFpsManualTransferFeeHkd(),
): number {
  const gross = Number(grossHkd);
  const fee = Number(feeHkd);
  if (!Number.isFinite(gross) || gross <= 0) {
    return 0;
  }
  if (!Number.isFinite(fee) || fee <= 0) {
    return gross;
  }
  return Math.max(gross - fee, 0);
}

export function formatFpsManualTransferFeeLabel(
  feeHkd: number = resolveFpsManualTransferFeeHkd(),
): string {
  const fee = Number(feeHkd);
  if (!Number.isFinite(fee) || fee <= 0) {
    return "免收";
  }
  return `HK$${fee}`;
}

export function buildFpsPayoutPolicyTermsLine(feeHkd?: number): string {
  const fee = feeHkd ?? resolveFpsManualTransferFeeHkd();
  if (fee <= 0) {
    return "3. 所有提現結算統一於每週五進行人工 FPS 劃撥，目前免除任何銀行轉賬手續費。";
  }
  return `3. 所有提現結算統一於每週五進行人工 FPS 劃撥，每筆劃撥收取 HK$${fee} 銀行轉賬手續費。`;
}
