-- Add is_enabled column to keyword_sets table
ALTER TABLE keyword_sets
ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- Optionally, update existing rows to TRUE if they were implicitly enabled
-- UPDATE keyword_sets SET is_enabled = TRUE WHERE is_enabled IS NULL;