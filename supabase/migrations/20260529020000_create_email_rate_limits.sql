CREATE TABLE email_rate_limits (
  id      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email   TEXT        NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON email_rate_limits (email, sent_at);
