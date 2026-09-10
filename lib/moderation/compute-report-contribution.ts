export type ComputeReportContributionInput = {
  categoryWeight: number;
  hasValidatedChatRoom: boolean;
  reporterTrustMultiplier?: number;
  duplicateDampening?: number;
};

export function computeReportContribution({
  categoryWeight,
  hasValidatedChatRoom,
  reporterTrustMultiplier = 1,
  duplicateDampening = 1,
}: ComputeReportContributionInput): number {
  const contextMultiplier = hasValidatedChatRoom ? 1.1 : 1;
  const raw =
    categoryWeight *
    reporterTrustMultiplier *
    contextMultiplier *
    duplicateDampening;

  return Math.round(raw * 100) / 100;
}
