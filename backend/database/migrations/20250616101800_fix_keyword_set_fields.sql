-- Migration to fix KeywordSet field discrepancies

-- Step 1: Rename the 'keywords' column to 'rules'
ALTER TABLE keyword_sets RENAME COLUMN keywords TO rules;

-- Step 2: Change the 'rules' column to be nullable
ALTER TABLE keyword_sets ALTER COLUMN rules DROP NOT NULL;