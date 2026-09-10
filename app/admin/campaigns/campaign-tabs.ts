export type CampaignTab = "activities" | "check_in";

export function resolveCampaignTab(param?: string | null): CampaignTab {
  if (param === "check-in") {
    return "check_in";
  }
  if (param === "activities") {
    return "activities";
  }
  // Legacy URLs (e.g. ?tab=roi) fall back to the main activities tab.
  return "activities";
}

export function campaignTabToQuery(tab: CampaignTab): string | null {
  if (tab === "check_in") {
    return "check-in";
  }
  return null;
}
