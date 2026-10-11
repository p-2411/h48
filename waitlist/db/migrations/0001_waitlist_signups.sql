-- Waitlist sign-ups. Email is the only required personal field; home details are optional.
CREATE TABLE IF NOT EXISTS waitlist_signups (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email            text NOT NULL UNIQUE CHECK (email = lower(email) AND length(email) <= 254),
  referral_code    text NOT NULL UNIQUE,
  referred_by      text,
  edit_token_hash  text NOT NULL,
  home_type        text CHECK (home_type IN ('rent', 'own', 'apartment')),
  postcode         text CHECK (postcode ~ '^[0-9]{4}$'),
  utm_source       text,
  utm_medium       text,
  utm_campaign     text,
  privacy_version  text NOT NULL,
  consented_at     timestamptz NOT NULL DEFAULT now(),
  details_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS waitlist_signups_edit_token_hash_idx ON waitlist_signups (edit_token_hash);
CREATE INDEX IF NOT EXISTS waitlist_signups_referred_by_idx ON waitlist_signups (referred_by);
