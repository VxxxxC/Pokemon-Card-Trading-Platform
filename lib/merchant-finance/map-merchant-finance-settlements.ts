import { z } from "zod";

export const MerchantFinanceSettlementSchema = z.object({
  orderId: z.string(),
  orderNumber: z.string().nullable(),
  cardName: z.string().nullable(),
  amount: z.coerce.number(),
  commissionAmount: z.coerce.number().nullable(),
  paidAt: z.string().nullable(),
  payoutStatus: z.string(),
  payoutHoldUntil: z.string().nullable(),
  stripeTransferId: z.string().nullable(),
  stripePaymentIntentId: z.string().nullable(),
  payoutError: z.string().nullable(),
});

export const MerchantFinanceSettlementsRpcSchema = z.object({
  monthEarned: z.coerce.number(),
  total: z.coerce.number(),
  page: z.coerce.number(),
  pageSize: z.coerce.number(),
  totalPages: z.coerce.number(),
  rows: z.array(MerchantFinanceSettlementSchema),
});

export type MerchantFinanceSettlementsRpcPayload = z.infer<
  typeof MerchantFinanceSettlementsRpcSchema
>;

export function mapMerchantFinanceSettlementsRpcPayload(
  payload: unknown,
): MerchantFinanceSettlementsRpcPayload | null {
  const parsed = MerchantFinanceSettlementsRpcSchema.safeParse(payload);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}
