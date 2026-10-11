-- Consent record details (Spam Act / ACMA expectations): where the person signed up and a
-- one-way hash of their IP, never the raw address.
ALTER TABLE waitlist_signups ADD COLUMN IF NOT EXISTS landing_path text;
ALTER TABLE waitlist_signups ADD COLUMN IF NOT EXISTS referrer text;
ALTER TABLE waitlist_signups ADD COLUMN IF NOT EXISTS ip_hash text;

-- Hashed emails of people who asked to be removed, so they are never added back by mistake.
CREATE TABLE IF NOT EXISTS waitlist_suppressions (
  email_hash  text PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now()
);
