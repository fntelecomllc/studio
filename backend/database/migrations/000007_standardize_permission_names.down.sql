-- Rollback migration to revert permission names from colon notation back to dot notation

UPDATE auth.permissions SET name = 'campaigns.create' WHERE name = 'campaigns:create';
UPDATE auth.permissions SET name = 'campaigns.read' WHERE name = 'campaigns:read';
UPDATE auth.permissions SET name = 'campaigns.update' WHERE name = 'campaigns:update';
UPDATE auth.permissions SET name = 'campaigns.delete' WHERE name = 'campaigns:delete';
UPDATE auth.permissions SET name = 'campaigns.execute' WHERE name = 'campaigns:execute';

UPDATE auth.permissions SET name = 'personas.create' WHERE name = 'personas:create';
UPDATE auth.permissions SET name = 'personas.read' WHERE name = 'personas:read';
UPDATE auth.permissions SET name = 'personas.update' WHERE name = 'personas:update';
UPDATE auth.permissions SET name = 'personas.delete' WHERE name = 'personas:delete';

UPDATE auth.permissions SET name = 'proxies.create' WHERE name = 'proxies:create';
UPDATE auth.permissions SET name = 'proxies.read' WHERE name = 'proxies:read';
UPDATE auth.permissions SET name = 'proxies.update' WHERE name = 'proxies:update';
UPDATE auth.permissions SET name = 'proxies.delete' WHERE name = 'proxies:delete';

UPDATE auth.permissions SET name = 'system.admin' WHERE name = 'system:admin';
UPDATE auth.permissions SET name = 'system.config' WHERE name = 'system:config';
UPDATE auth.permissions SET name = 'system.users' WHERE name = 'system:users';
UPDATE auth.permissions SET name = 'system.audit' WHERE name = 'system:audit';