import { Suspense } from "react";
import { MerchantStorefrontPageData } from "./MerchantStorefrontPageData";
import { MerchantStorefrontPageSkeleton } from "./MerchantStorefrontPageSkeleton";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ persona?: string }>;
}

export default function MerchantStorefrontPage({
  params,
  searchParams,
}: PageProps) {
  return (
    <Suspense fallback={<MerchantStorefrontPageSkeleton />}>
      <MerchantStorefrontPageData params={params} searchParams={searchParams} />
    </Suspense>
  );
}
