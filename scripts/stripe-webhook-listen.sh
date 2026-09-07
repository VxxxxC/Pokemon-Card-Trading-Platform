#!/usr/bin/env bash
# Local dev: forward Stripe webhooks to Next.js with P0+ event list.
# Copy the printed whsec_... into .env STRIPE_WEBHOOK_SECRET.
set -euo pipefail

PORT="${PORT:-3000}"
EVENTS="account.updated,payment_intent.amount_capturable_updated,payment_intent.succeeded,payment_intent.canceled,payment_intent.payment_failed,transfer.created,refund.created"

echo "Forwarding Stripe events to http://localhost:${PORT}/api/stripe/webhook"
echo "Events: ${EVENTS}"
echo ""
echo "Set STRIPE_WEBHOOK_SECRET to the whsec_... secret printed below."
echo ""

exec stripe listen --forward-to "localhost:${PORT}/api/stripe/webhook" --events "${EVENTS}" --log-level debug
