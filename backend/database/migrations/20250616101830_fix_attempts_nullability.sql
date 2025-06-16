-- Migration to fix attempts field nullability

-- Step 1: Make 'attempts' nullable in 'http_keyword_results'
ALTER TABLE http_keyword_results ALTER COLUMN attempts DROP NOT NULL;

-- Step 2: Make 'attempts' nullable in 'dns_validation_results'
ALTER TABLE dns_validation_results ALTER COLUMN attempts DROP NOT NULL;