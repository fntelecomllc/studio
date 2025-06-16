-- Migration to add keyword_rules table

-- Create keyword_rules table
CREATE TABLE IF NOT EXISTS keyword_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    keyword_set_id UUID NOT NULL REFERENCES keyword_sets(id) ON DELETE CASCADE,
    pattern TEXT NOT NULL,
    rule_type TEXT NOT NULL CHECK (rule_type IN ('string', 'regex')),
    is_case_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
    category TEXT,
    context_chars INT NOT NULL DEFAULT 0 CHECK (context_chars >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_keyword_rules_keyword_set_id ON keyword_rules(keyword_set_id);

-- Add trigger to update the updated_at timestamp
DROP TRIGGER IF EXISTS set_timestamp_keyword_rules ON keyword_rules; 
CREATE TRIGGER set_timestamp_keyword_rules
BEFORE UPDATE ON keyword_rules
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

-- Add comment for documentation
COMMENT ON TABLE keyword_rules IS 'Stores individual keyword rules that belong to keyword sets';