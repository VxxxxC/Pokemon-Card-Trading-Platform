"use client";

import { useCallback, useState } from "react";
import {
  DEFAULT_GRADING_OPTION_ID,
  getGradingOption,
  isRawGradingOption,
} from "@/lib/grading/options";
import { useListingAuthService } from "@/lib/listings/use-listing-auth-service";

export type UseListingGradingAuthFieldsOptions = {
  initialGradingOptionId?: string;
  initialAcceptsBuyerAuth?: boolean;
  /** Merch create flow: enable auth toggle when user selects raw grading */
  enableAuthOnRawGradingSelect?: boolean;
};

export function useListingGradingAuthFields({
  initialGradingOptionId = DEFAULT_GRADING_OPTION_ID,
  initialAcceptsBuyerAuth = false,
  enableAuthOnRawGradingSelect = false,
}: UseListingGradingAuthFieldsOptions = {}) {
  const [gradingOptionId, setGradingOptionIdState] = useState(
    initialGradingOptionId,
  );

  const auth = useListingAuthService({
    gradingOptionId,
    initialAcceptsBuyerAuth,
  });
  const { setAcceptsBuyerAuth } = auth;

  const setGradingOptionId = useCallback(
    (id: string) => {
      setGradingOptionIdState(id);
      if (
        enableAuthOnRawGradingSelect &&
        isRawGradingOption(getGradingOption(id))
      ) {
        setAcceptsBuyerAuth(true);
      }
    },
    [enableAuthOnRawGradingSelect, setAcceptsBuyerAuth],
  );

  return {
    gradingOptionId,
    setGradingOptionId,
    setGradingOptionIdState,
    acceptsBuyerAuth: auth.acceptsBuyerAuth,
    setAcceptsBuyerAuth: auth.setAcceptsBuyerAuth,
    resolvedUseAuthentication: auth.resolvedUseAuthentication,
    showListingAuthToggle: auth.showListingAuthToggle,
    isRawCardListing: auth.isRawCardListing,
  };
}
