export type AdminDashboardTrendPoint = {
  label: string;
  value: number;
};

export type AdminDashboardEcologySegment = {
  key: "user" | "merchant" | "pending";
  role: string;
  count: number;
  formattedCount: string;
  pct: number;
  pctStr: string;
  color: string;
  description: string;
};

export type AdminDashboardMetrics = {
  userEcology: {
    totalUsers: number;
    totalUsersFormatted: string;
    bannedUsers: number | null;
    activeRatio: string | null;
    activeCount: string | null;
    distribution: AdminDashboardEcologySegment[];
  };
  marketVolume: {
    totalGmv: string;
    monthlyGmv: string;
    settledCount: string;
    monthlySettledCount: string;
    listingCount: string;
    growthRate: string | null;
  };
  revenues: {
    totalCommission: string;
    monthlyCommission: string;
    commissionRate: string;
    commissionGrowth: string | null;
    appraisalTotal: string;
    monthlyAppraisal: string;
    monthlyNetRevenue: string;
    totalNetRevenue: string;
    monthlyAppraisalCount: string;
    appraisalFeePerCard: string;
    totalAppraisals: string;
  };
  stripeBalance: {
    availableFormatted: string;
    pendingFormatted: string;
    currency: "HKD";
    lastSyncedAt: string;
    unavailable: boolean;
    unavailableReason: string | null;
  };
  alerts: {
    unprocessedReports: number;
    pendingKyc: number;
    pendingGrading: number;
  };
  syncedAt: string;
  trends: {
    netRevenue: AdminDashboardTrendPoint[];
    gmv: AdminDashboardTrendPoint[];
  };
};

export type AdminDashboardMetricsResult =
  | { success: true; data: AdminDashboardMetrics }
  | { success: false; error: string };

export type AdminDashboardSystemService = {
  id: "supabase" | "stripe" | "crawler";
  name: string;
  subName: string;
  status: "online" | "degraded" | "offline";
  latency: number;
};

export type AdminDashboardHealthResult =
  | { success: true; data: { services: AdminDashboardSystemService[] } }
  | { success: false; error: string };
