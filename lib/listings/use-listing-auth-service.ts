"use client";

import { useMemo, useState } from "react";
import {
  getGradingOption,
  isRawGradingOption,
} from "@/lib/grading/options";

type UseListingAuthServiceOptions = {
  gradingOptionId: string;
  initialAcceptsBuyerAuth?: boolean;
};

export function resolveUseAuthenticationForGrading(input: {
  gradingOptionId: string;
  acceptsBuyerAuth: boolean;
}): boolean {
  const gradingOption = getGradingOption(input.gradingOptionId);
  return isRawGradingOption(gradingOption) ? input.acceptsBuyerAuth : false;
}

export function useListingAuthService({
  gradingOptionId,
  initialAcceptsBuyerAuth = false,
}: UseListingAuthServiceOptions) {
  const gradingOption = useMemo(
    () => getGradingOption(gradingOptionId),
    [gradingOptionId],
  );
  const isRawCardListing = isRawGradingOption(gradingOption);
  const [rawAuthPreference, setRawAuthPreference] = useState(
    initialAcceptsBuyerAuth,
  );

  return {
    isRawCardListing,
    acceptsBuyerAuth: isRawCardListing ? rawAuthPreference : false,
    setAcceptsBuyerAuth: setRawAuthPreference,
    resolvedUseAuthentication: resolveUseAuthenticationForGrading({
      gradingOptionId,
      acceptsBuyerAuth: rawAuthPreference,
    }),
    showListingAuthToggle: isRawCardListing,
  };
}
