# Database Migrations

This project uses [golang-migrate](https://github.com/golang-migrate/migrate) for database migrations.

## Getting Started

### Prerequisites

- Go 1.16 or higher
- PostgreSQL 12 or higher
- `golang-migrate` CLI tool (optional, but recommended)

### Installation

1. Install the migration tool:
   ```bash
   go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest
   ```

2. Set up your database connection string:
   ```bash
   export DATABASE_URL=postgres://username:password@localhost:5432/your_database?sslmode=disable
   ```

## Using Migrations

### Run Migrations

```bash
make migrate-up
```

### Rollback the Last Migration

```bash
make migrate-down
```

### Create a New Migration

```bash
make migrate-create NAME=add_new_table
```

This will create two files in the `migrations` directory:
- `YYYYMMDDHHMMSS_add_new_table.up.sql`
- `YYYYMMDDHHMMSS_add_new_table.down.sql`

### Check Current Migration Version

```bash
make migrate-version
```

### Force a Specific Migration Version

```bash
make migrate-force VERSION=20230101000000
```

## Development Workflow

1. Create a new migration for your changes:
   ```bash
   make migrate-create NAME=my_feature_changes
   ```

2. Edit the generated SQL files:
   - `up.sql` - Contains the changes to apply
   - `down.sql` - Contains the SQL to revert the changes

3. Test your migration:
   ```bash
   # Apply the migration
   make migrate-up
   
   # Verify the changes
   make migrate-version
   
   # Rollback to test the down migration
   make migrate-down
   ```

## Best Practices

1. **Idempotency**: Ensure your migrations can be run multiple times without errors.
2. **Atomicity**: Each migration should be atomic - it should either fully complete or fully fail.
3. **Backward Compatibility**: Maintain backward compatibility where possible.
4. **Testing**: Always test both up and down migrations.
5. **Documentation**: Document any non-obvious changes in the migration files.

## Troubleshooting

- If you get a `no such file or directory` error, ensure you're running commands from the project root.
- If you encounter a database connection error, verify your `DATABASE_URL` environment variable.
- For `pq: permission denied` errors, check your database user permissions.

## Production Deployment

For production deployments, consider using:

```bash
# Run migrations during deployment
make migrate-up

# Or use the migrate tool directly
migrate -path ./migrations -database "$DATABASE_URL" up
```
