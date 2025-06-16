-- Remove is_enabled column from keyword_sets table
ALTER TABLE keyword_sets
DROP COLUMN IF EXISTS is_enabled;