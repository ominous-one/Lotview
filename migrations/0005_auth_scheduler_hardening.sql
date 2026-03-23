-- Additive production-safe hardening migration
-- 1) password reset token lookup hash for O(1)-style candidate lookup
ALTER TABLE password_reset_tokens
  ADD COLUMN IF NOT EXISTS token_lookup_hash text;

CREATE INDEX IF NOT EXISTS password_reset_tokens_token_lookup_hash_idx
  ON password_reset_tokens (token_lookup_hash);
