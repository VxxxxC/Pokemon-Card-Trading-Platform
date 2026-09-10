export type UserRole = "USER" | "MERCHANT" | "ADMIN" | "PENDING_MERCHANT";

export interface UserProfile {
  id: string;
  name: string;
  handle: string;
  avatarSeed: string;
  role: UserRole;
  joinDate: string;
  verifiedBuyer: boolean;
  rating: number;
  reviewCount: number;
  level: string;
  levelTier: number;
  nextLevel: string;
  xpCurrent: number;
  xpRequired: number;
}

export interface MerchantProfile {
  id: string;
  name: string;
  shopName: string;
  handle: string;
  avatarSeed: string;
  joinDate: string;
  kycVerified: boolean;
  stripeConnected: boolean;
  rating: number;
  reviewCount: number;
  totalListings: number;
  totalSalesCount: number;
}

export interface EscrowStep {
  id: string;
  label: string;
  description: string;
}

export const ESCROW_STEPS: EscrowStep[] = [
  { id: "payment", label: "已付款", description: "買家完成卡價與鑑定服務費託管付款" },
  { id: "custody", label: "保管中", description: "賣家已將卡牌寄往平台倉庫" },
  { id: "grading", label: "鑑定中", description: "平台第三方鑑定機構處理中" },
  { id: "shipped", label: "已發貨", description: "平台已代發貨，卡牌運送中" },
  { id: "released", label: "已釋放", description: "款項已釋放給賣家" },
];

export type OrderStatus =
  | "payment"
  | "custody"
  | "shipped"
  | "grading"
  | "released";
export type ListingStatus =
  | "active"
  | "sold"
  | "draft"
  | "pending"
  | "inactive";
export type KycStatus = "pending" | "approved" | "rejected";
