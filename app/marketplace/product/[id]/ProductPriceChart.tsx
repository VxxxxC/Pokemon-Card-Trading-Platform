"use client";

import Link from "next/link";
import {
  PRODUCT_DETAIL_PANEL_CLASS,
  PRODUCT_DETAIL_SECTION_TITLE_CLASS,
} from "./product-detail-ui";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

const chartConfig = {
  skuPrice: {
    label: "售價 (HK$)",
    color: "#d4a574",
  },
} satisfies ChartConfig;

export type ProductPriceChartPoint = {
  day: number;
  date: string;
  price: number;
};

type ProductPriceChartProps = {
  chartPoints: ProductPriceChartPoint[];
  isGuest: boolean;
  productPath: string;
};

export function ProductPriceChart({
  chartPoints,
  isGuest,
  productPath,
}: ProductPriceChartProps) {
  return (
    <div
      className={`relative overflow-hidden ${PRODUCT_DETAIL_PANEL_CLASS} p-3 space-y-2`}
    >
      {isGuest && (
        <div className="absolute inset-0 bg-[#17130f]/60 backdrop-blur-md z-30 flex flex-col items-center justify-center p-4 text-center select-none animate-fadeIn">
          <p className="font-sans font-semibold text-[13px] text-[#eae1da] mb-2.5">
            登入免費查閱完整市場大盤走勢
          </p>
          <Link
            href={`/auth?redirect=${encodeURIComponent(productPath)}`}
            className="inline-flex items-center justify-center h-8 px-4 bg-brand text-[#1A1612] font-sans font-bold text-[12px] rounded-lg hover:bg-brand-hover transition-all active:scale-[0.97] cursor-pointer"
          >
            登入 / 註冊
          </Link>
        </div>
      )}
      <h3 className={PRODUCT_DETAIL_SECTION_TITLE_CLASS}>
        全網 30 天成交均價走勢
      </h3>

      <div className="h-48 sm:h-56 lg:h-60 w-full">
        <ChartContainer config={chartConfig} className="h-full w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartPoints}>
              <defs>
                <linearGradient id="priceChart" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#d4a574" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#d4a574" stopOpacity={0.0} />
                </linearGradient>
              </defs>

              <CartesianGrid
                vertical={false}
                stroke="rgba(255,255,255,0.04)"
              />

              <XAxis
                dataKey="date"
                scale="band"
                tickLine={false}
                axisLine={false}
                tickMargin={10}
                style={{
                  fill: "#8A8680",
                  fontSize: 10,
                  fontFamily: "monospace",
                }}
              />

              <YAxis
                yAxisId="priceId"
                hide
                includeHidden
                label={"價格 (HK$)"}
                orientation="right"
                domain={[0, "auto"]}
                tickCount={6}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                style={{
                  fill: "#d4a574",
                  fontSize: 10,
                  fontFamily: "monospace",
                }}
                tickFormatter={(val) => `$${val.toLocaleString()}`}
              />
              <ChartTooltip
                cursor={{ fill: "#ffffff", opacity: 0.2 }}
                content={
                  <ChartTooltipContent
                    className="bg-[#1A1612] border border-white/10 [&&_*]:text-[#eae1da]"
                    labelClassName="text-sm"
                  />
                }
              />

              <Area
                yAxisId="priceId"
                type="monotone"
                dataKey="price"
                fill="url(#priceChart)"
                stroke={"#d4a574"}
                strokeWidth={2}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>
    </div>
  );
}
