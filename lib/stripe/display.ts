/** Truncate Stripe resource IDs (pi_, tr_, ch_, etc.) for compact UI display. */
export function truncateStripeId(id: string | null | undefined): string {
  if (!id) {
    return "—";
  }
  if (id.length <= 16) {
    return id;
  }
  return `${id.slice(0, 10)}…${id.slice(-6)}`;
}
