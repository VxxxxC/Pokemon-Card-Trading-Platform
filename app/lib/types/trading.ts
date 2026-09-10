export type OrderStatus = 'payment' | 'custody' | 'shipped' | 'grading' | 'released' | 'cancelled';

export const STATUS_STEP_INDEX: Record<Exclude<OrderStatus, 'cancelled'>, number> = {
  payment: 0,
  custody: 1,
  shipped: 2,
  grading: 3,
  released: 4,
};

export interface SaleOrder {
  id: string;
  orderNumber?: string;
  buyerId: string;     // Unique user identity for deterministic chat room hashing
  buyerName: string;
  sellerId: string;    // Unique seller identity for deterministic chat room hashing
  sellerName: string;  // To cleanly differentiate C2C multi-seller nodes
  cardName: string;
  cardNo: string;
  grade: string;
  amount: number;
  status: OrderStatus;
  statusLabelOverride?: string;    // 🆕 託管步進器以外的細分狀態文案（例：待買家付款）
  createdAt: string;
  trackingNo?: string;
  orderType: 'B2C' | 'C2C';         // B2C processes bypass standard initial escrow step indexes; C2C holds rigid peer custody checks
  userContext: 'BUYER' | 'SELLER';   // For general user page reusability; for merchant views, maps to 'SELLER'
  rating?: number;
  level?: string;
  bidTimestamp?: string;
  avatarSeed?: string;
  productListingId?: string;       // 🆕 商品上架序號 (Product Listing ID)
  hasAuthenticationToggle?: boolean; // 🆕 買家出價時是否開啟了鑑定服務
}
