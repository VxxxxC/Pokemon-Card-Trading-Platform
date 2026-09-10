export type RecognizedRow = {
  amount: number;
  recognizedAt: string | null;
};

type GmvOrderRow = {
  item_subtotal: number | null;
  final_price: number;
  buyer_confirmed_at: string | null;
  updated_at: string | null;
};

type AuthFeeOrderRow = {
  auth_fee: number;
  auth_fee_captured_at: string | null;
};

export function resolveGmvAmount(
  itemSubtotal: number | null,
  finalPrice: number | null,
): number {
  return itemSubtotal ?? finalPrice ?? 0;
}

export function resolveOrderRecognitionAt(
  buyerConfirmedAt: string | null,
  updatedAt: string | null,
): string | null {
  return buyerConfirmedAt ?? updatedAt;
}

export function mapGmvRows(orders: GmvOrderRow[]): RecognizedRow[] {
  return orders.map((order) => ({
    amount: resolveGmvAmount(order.item_subtotal, order.final_price),
    recognizedAt: resolveOrderRecognitionAt(
      order.buyer_confirmed_at,
      order.updated_at,
    ),
  }));
}

export function mapCommissionRows(
  orders: Array<{
    commission_amount: number | null;
    buyer_confirmed_at: string | null;
    updated_at: string | null;
  }>,
): RecognizedRow[] {
  return orders.map((order) => ({
    amount: order.commission_amount ?? 0,
    recognizedAt: resolveOrderRecognitionAt(
      order.buyer_confirmed_at,
      order.updated_at,
    ),
  }));
}

export function mapAuthFeeRows(orders: AuthFeeOrderRow[]): RecognizedRow[] {
  return orders.map((order) => ({
    amount: order.auth_fee ?? 0,
    recognizedAt: order.auth_fee_captured_at,
  }));
}

export function mergeRecognizedRows(...groups: RecognizedRow[][]): RecognizedRow[] {
  return groups.flat();
}
