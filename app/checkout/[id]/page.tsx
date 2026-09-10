"use client";

import { use } from "react";
import { CheckoutClient } from "@/app/checkout/[id]/CheckoutClient";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function GlobalCheckoutPage({ params }: PageProps) {
  const resolvedParams = use(params);
  return <CheckoutClient orderId={resolvedParams.id} />;
}
