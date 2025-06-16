-- Database cleanup migration: Remove password reset and demo account features
-- This script removes tables and columns related to password reset functionality
-- Run this after verifying the application works without these features

-- Remove password reset tokens table
DROP TABLE IF EXISTS auth.password_reset_tokens CASCADE;

-- Remove any demo account data (if any exists)
-- Note: This query will only execute if demo accounts exist
-- You should verify first if any demo accounts are in the database

-- Check for any demo accounts and log them (uncomment to check first)
-- SELECT id, email, username FROM auth.users WHERE email LIKE '%demo%' OR username LIKE '%demo%';

-- Uncomment the following line ONLY after verifying what demo accounts exist:
-- DELETE FROM auth.users WHERE email LIKE '%demo%' OR username LIKE '%demo%';

-- Clean up any orphaned data that might reference password reset tokens
-- Note: The CASCADE on the DROP TABLE should handle most of this

-- Optional: Clean up any old session data (uncomment if you want to force all users to re-login)
-- DELETE FROM auth.sessions;

-- Log completion
SELECT 'Database cleanup migration completed - removed password_reset_tokens table' as status;
