-- Transactional email outbox (Resend worker). Service-role only; no RLS policies.

CREATE TYPE public.notification_email_status AS ENUM (
    'pending',
    'sent',
    'failed',
    'dead'
);

CREATE TABLE public.notification_email_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key TEXT NOT NULL,
    event_id TEXT NOT NULL,
    template_key TEXT NOT NULL,
    to_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    html_body TEXT NOT NULL,
    text_body TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status public.notification_email_status NOT NULL DEFAULT 'pending',
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 5,
    last_error TEXT,
    resend_message_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at TIMESTAMPTZ,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_notification_email_outbox_attempts_nonneg CHECK (attempts >= 0),
    CONSTRAINT chk_notification_email_outbox_max_attempts_positive CHECK (max_attempts > 0),
    CONSTRAINT uq_notification_email_outbox_idempotency UNIQUE (idempotency_key)
);

CREATE INDEX idx_notification_email_outbox_worker
    ON public.notification_email_outbox (next_attempt_at, created_at)
    WHERE status IN ('pending', 'failed');

ALTER TABLE public.notification_email_outbox ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.notification_email_outbox IS
    'Transactional email queue; processed by app/api/cron/process-email-outbox via service role.';
