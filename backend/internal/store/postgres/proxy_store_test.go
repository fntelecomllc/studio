package postgres

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/fntelecomllc/studio/backend/internal/models"
	"github.com/fntelecomllc/studio/backend/internal/store"
	"github.com/google/uuid"
	_ "github.com/lib/pq" // PostgreSQL driver
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// clearProxiesTable is a helper to clean the proxies table before each test.
func clearProxiesTable(t *testing.T) {
	require.NotNil(t, testDB, "testDB is nil. Ensure TestMain ran or TEST_POSTGRES_DSN is not set.")
	_, err := testDB.ExecContext(context.Background(), "DELETE FROM proxies")
	require.NoError(t, err, "Failed to clear proxies table")
}

func TestProxyStore_CreateProxy(t *testing.T) {
	if testDB == nil {
		t.Skip("Skipping Postgres tests as TEST_POSTGRES_DSN is not set.")
	}
	proxyStore := NewProxyStorePostgres(testDB)
	ctx := context.Background()

	t.Run("successful creation", func(t *testing.T) {
		clearProxiesTable(t)
		proxy := &models.Proxy{
			ID:          uuid.New(),
			Name:        "Test Proxy Create",
			Description: sql.NullString{String: "A test proxy", Valid: true},
			Address:     "http://127.0.0.1:8080", // Full URL now
			Protocol:    models.ProxyProtocolEnumPtr(models.ProxyProtocolHTTP),
			IsEnabled:   true,
			IsHealthy:   true,
			CreatedAt:   time.Now().UTC().Truncate(time.Millisecond),
			UpdatedAt:   time.Now().UTC().Truncate(time.Millisecond),
		}

		err := proxyStore.CreateProxy(ctx, testDB, proxy)
		assert.NoError(t, err)

		retrieved, err := proxyStore.GetProxyByID(ctx, testDB, proxy.ID)
		require.NoError(t, err)
		require.NotNil(t, retrieved)
		assert.Equal(t, proxy.Name, retrieved.Name)
		assert.Equal(t, proxy.Address, retrieved.Address)
		require.NotNil(t, retrieved.Protocol)
		assert.Equal(t, *proxy.Protocol, *retrieved.Protocol)
	})

	t.Run("duplicate name", func(t *testing.T) {
		clearProxiesTable(t)
		proxy1 := &models.Proxy{ID: uuid.New(), Name: "Duplicate Name Proxy", Address: "http://1.1.1.1:80", Protocol: models.ProxyProtocolEnumPtr(models.ProxyProtocolHTTP), CreatedAt: time.Now(), UpdatedAt: time.Now()}
		proxy2 := &models.Proxy{ID: uuid.New(), Name: "Duplicate Name Proxy", Address: "socks5://2.2.2.2:80", Protocol: models.ProxyProtocolEnumPtr(models.ProxyProtocolSOCKS5), CreatedAt: time.Now(), UpdatedAt: time.Now()}

		err := proxyStore.CreateProxy(ctx, testDB, proxy1)
		require.NoError(t, err)

		err = proxyStore.CreateProxy(ctx, testDB, proxy2)
		assert.ErrorIs(t, err, store.ErrDuplicateEntry, "Creating proxy with duplicate name should fail")
	})

	t.Run("duplicate address", func(t *testing.T) {
		clearProxiesTable(t)
		proxy1 := &models.Proxy{ID: uuid.New(), Name: "Address Test 1", Address: "http://3.3.3.3:8080", Protocol: models.ProxyProtocolEnumPtr(models.ProxyProtocolHTTP), CreatedAt: time.Now(), UpdatedAt: time.Now()}
		proxy2 := &models.Proxy{ID: uuid.New(), Name: "Address Test 2", Address: "http://3.3.3.3:8080", Protocol: models.ProxyProtocolEnumPtr(models.ProxyProtocolSOCKS5), CreatedAt: time.Now(), UpdatedAt: time.Now()}

		err := proxyStore.CreateProxy(ctx, testDB, proxy1)
		require.NoError(t, err)

		err = proxyStore.CreateProxy(ctx, testDB, proxy2)
		assert.ErrorIs(t, err, store.ErrDuplicateEntry, "Creating proxy with duplicate address should fail")
	})

	t.Run("duplicate ID", func(t *testing.T) {
		clearProxiesTable(t)
		commonID := uuid.New()
		proxy1 := &models.Proxy{ID: commonID, Name: "ID Proxy 1", Address: "http://4.4.4.1:80", Protocol: models.ProxyProtocolEnumPtr(models.ProxyProtocolHTTP), CreatedAt: time.Now(), UpdatedAt: time.Now()}
		proxy2 := &models.Proxy{ID: commonID, Name: "ID Proxy 2", Address: "socks5://4.4.4.2:80", Protocol: models.ProxyProtocolEnumPtr(models.ProxyProtocolSOCKS5), CreatedAt: time.Now(), UpdatedAt: time.Now()}

		err := proxyStore.CreateProxy(ctx, testDB, proxy1)
		require.NoError(t, err)

		err = proxyStore.CreateProxy(ctx, testDB, proxy2)
		assert.ErrorIs(t, err, store.ErrDuplicateEntry, "Creating proxy with duplicate ID should fail")
	})
}

func TestProxyStore_GetProxyByID(t *testing.T) {
	if testDB == nil {
		t.Skip("Skipping Postgres tests as TEST_POSTGRES_DSN is not set.")
	}
	proxyStore := NewProxyStorePostgres(testDB)
	ctx := context.Background()
	clearProxiesTable(t)

	proxy := &models.Proxy{
		ID:        uuid.New(),
		Name:      "Get By ID Proxy",
		Address:   "https://get.proxy.com:443",
		Protocol:  models.ProxyProtocolEnumPtr(models.ProxyProtocolHTTPS),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	err := proxyStore.CreateProxy(ctx, testDB, proxy)
	require.NoError(t, err)

	retrieved, err := proxyStore.GetProxyByID(ctx, testDB, proxy.ID)
	assert.NoError(t, err)
	require.NotNil(t, retrieved)
	assert.Equal(t, proxy.ID, retrieved.ID)
	assert.Equal(t, proxy.Name, retrieved.Name)

	_, err = proxyStore.GetProxyByID(ctx, testDB, uuid.New()) // Non-existent ID
	assert.ErrorIs(t, err, store.ErrNotFound)
}

func TestProxyStore_UpdateProxy(t *testing.T) {
	if testDB == nil {
		t.Skip("Skipping Postgres tests as TEST_POSTGRES_DSN is not set.")
	}
	proxyStore := NewProxyStorePostgres(testDB)
	ctx := context.Background()
	clearProxiesTable(t)

	proxy := &models.Proxy{
		ID:        uuid.New(),
		Name:      "Update Proxy Original",
		Address:   "http://original.addr:80",
		Protocol:  models.ProxyProtocolEnumPtr(models.ProxyProtocolHTTP),
		IsEnabled: true,
		IsHealthy: true,
		CreatedAt: time.Now().UTC().Truncate(time.Millisecond),
		UpdatedAt: time.Now().UTC().Truncate(time.Millisecond),
	}
	err := proxyStore.CreateProxy(ctx, testDB, proxy)
	require.NoError(t, err)

	retrieved, _ := proxyStore.GetProxyByID(ctx, testDB, proxy.ID)

	retrieved.Name = "Updated Proxy Name"
	retrieved.IsEnabled = false
	retrieved.Address = "socks5://user@updated.addr:8080" // Include user in address
	retrieved.Protocol = models.ProxyProtocolEnumPtr(models.ProxyProtocolSOCKS5)
	// Username is now parsed from Address or set via InputUsername for creation/update logic if needed
	// For direct update like this, ensure Address field is the source of truth for URL parts.
	// If db.username is to be updated directly, it.
	// retrieved.Username = sql.NullString{String: "user", Valid: true} // This would map to db:"username"
	retrieved.UpdatedAt = time.Now().UTC().Truncate(time.Millisecond).Add(time.Second)

	err = proxyStore.UpdateProxy(ctx, testDB, retrieved)
	assert.NoError(t, err)

	updated, errGet := proxyStore.GetProxyByID(ctx, testDB, proxy.ID)
	require.NoError(t, errGet)
	assert.Equal(t, "Updated Proxy Name", updated.Name)
	assert.False(t, updated.IsEnabled)
	assert.Equal(t, "socks5://user@updated.addr:8080", updated.Address)
	require.NotNil(t, updated.Protocol)
	assert.Equal(t, models.ProxyProtocolSOCKS5, *updated.Protocol)
	// Username from DB should reflect the one parsed from Address if store logic handles it,
	// or be explicitly set if that's the desired update path.
	// For this test, we assume Address is the primary source for connection string.
	// assert.Equal(t, "user", updated.Username.String) // This depends on how UpdateProxy handles Address parsing
	assert.True(t, updated.UpdatedAt.After(proxy.CreatedAt), "UpdatedAt should be after CreatedAt")

	// Test update non-existent proxy
	nonExistentProxy := &models.Proxy{
		ID:        uuid.New(),
		Name:      "Non Existent Proxy",
		Address:   "http://non.existent:80",
		Protocol:  models.ProxyProtocolEnumPtr(models.ProxyProtocolHTTP),
		UpdatedAt: time.Now(),
	}
	err = proxyStore.UpdateProxy(ctx, testDB, nonExistentProxy)
	assert.ErrorIs(t, err, store.ErrNotFound)
}

func TestProxyStore_DeleteProxy(t *testing.T) {
	if testDB == nil {
		t.Skip("Skipping Postgres tests as TEST_POSTGRES_DSN is not set.")
	}
	proxyStore := NewProxyStorePostgres(testDB)
	ctx := context.Background()
	clearProxiesTable(t)

	proxy := &models.Proxy{ID: uuid.New(), Name: "Delete Me Proxy", Address: "http://delete.me:80", Protocol: models.ProxyProtocolEnumPtr(models.ProxyProtocolHTTP)}
	err := proxyStore.CreateProxy(ctx, testDB, proxy)
	require.NoError(t, err)

	err = proxyStore.DeleteProxy(ctx, testDB, proxy.ID)
	assert.NoError(t, err)

	_, err = proxyStore.GetProxyByID(ctx, testDB, proxy.ID)
	assert.ErrorIs(t, err, store.ErrNotFound)

	// Test delete non-existent proxy
	err = proxyStore.DeleteProxy(ctx, testDB, uuid.New())
	assert.ErrorIs(t, err, store.ErrNotFound)
}

func TestProxyStore_ListProxies(t *testing.T) {
	if testDB == nil {
		t.Skip("Skipping Postgres tests as TEST_POSTGRES_DSN is not set.")
	}
	proxyStore := NewProxyStorePostgres(testDB)
	ctx := context.Background()
	clearProxiesTable(t)

	proxiesData := []models.Proxy{
		{ID: uuid.New(), Name: "HTTP Proxy 1 (Enabled, Healthy)", Address: "http://h1.com:80", Protocol: models.ProxyProtocolEnumPtr(models.ProxyProtocolHTTP), IsEnabled: true, IsHealthy: true, CreatedAt: time.Now(), UpdatedAt: time.Now()},
		{ID: uuid.New(), Name: "SOCKS5 Proxy 1 (Enabled, Unhealthy)", Address: "socks5://s1.com:1080", Protocol: models.ProxyProtocolEnumPtr(models.ProxyProtocolSOCKS5), IsEnabled: true, IsHealthy: false, CreatedAt: time.Now(), UpdatedAt: time.Now()},
		{ID: uuid.New(), Name: "HTTP Proxy 2 (Disabled, Healthy)", Address: "http://h2.com:80", Protocol: models.ProxyProtocolEnumPtr(models.ProxyProtocolHTTP), IsEnabled: false, IsHealthy: true, CreatedAt: time.Now(), UpdatedAt: time.Now()},
		{ID: uuid.New(), Name: "HTTPS Proxy 1 (Enabled, Healthy)", Address: "https://hs1.com:443", Protocol: models.ProxyProtocolEnumPtr(models.ProxyProtocolHTTPS), IsEnabled: true, IsHealthy: true, CreatedAt: time.Now(), UpdatedAt: time.Now()},
	}

	for i := range proxiesData {
		err := proxyStore.CreateProxy(ctx, testDB, &proxiesData[i])
		require.NoError(t, err)
	}

	t.Run("list all", func(t *testing.T) {
		listed, err := proxyStore.ListProxies(ctx, testDB, store.ListProxiesFilter{})
		assert.NoError(t, err)
		assert.Len(t, listed, 4, "Should list all proxies")
	})

	t.Run("filter by protocol HTTP", func(t *testing.T) {
		listed, err := proxyStore.ListProxies(ctx, testDB, store.ListProxiesFilter{Protocol: models.ProxyProtocolHTTP})
		assert.NoError(t, err)
		assert.Len(t, listed, 2)
		for _, proxy := range listed {
			require.NotNil(t, proxy.Protocol)
			assert.Equal(t, models.ProxyProtocolHTTP, *proxy.Protocol)
		}
	})

	t.Run("filter by is_enabled true", func(t *testing.T) {
		enabled := true
		listed, err := proxyStore.ListProxies(ctx, testDB, store.ListProxiesFilter{IsEnabled: &enabled})
		assert.NoError(t, err)
		assert.Len(t, listed, 3)
		for _, proxy := range listed {
			assert.True(t, proxy.IsEnabled)
		}
	})

	t.Run("filter by is_healthy false", func(t *testing.T) {
		unhealthy := false
		listed, err := proxyStore.ListProxies(ctx, testDB, store.ListProxiesFilter{IsHealthy: &unhealthy})
		assert.NoError(t, err)
		assert.Len(t, listed, 1)
		assert.Equal(t, "SOCKS5 Proxy 1 (Enabled, Unhealthy)", listed[0].Name)
	})

	t.Run("filter by protocol SOCKS5 and is_enabled true", func(t *testing.T) {
		enabled := true
		listed, err := proxyStore.ListProxies(ctx, testDB, store.ListProxiesFilter{Protocol: models.ProxyProtocolSOCKS5, IsEnabled: &enabled})
		assert.NoError(t, err)
		assert.Len(t, listed, 1)
		assert.Equal(t, "SOCKS5 Proxy 1 (Enabled, Unhealthy)", listed[0].Name)
	})

	t.Run("limit and offset", func(t *testing.T) {
		listed, err := proxyStore.ListProxies(ctx, testDB, store.ListProxiesFilter{Limit: 2, Offset: 1})
		assert.NoError(t, err)
		assert.Len(t, listed, 2)
		// Based on default sort order (name ASC)
		assert.Equal(t, "HTTP Proxy 2 (Disabled, Healthy)", listed[0].Name)
		assert.Equal(t, "HTTPS Proxy 1 (Enabled, Healthy)", listed[1].Name)
	})
}

func TestProxyStore_UpdateProxyHealth(t *testing.T) {
	if testDB == nil {
		t.Skip("Skipping Postgres tests as TEST_POSTGRES_DSN is not set.")
	}
	proxyStore := NewProxyStorePostgres(testDB)
	ctx := context.Background()
	clearProxiesTable(t)

	proxy := &models.Proxy{
		ID:        uuid.New(),
		Name:      "Health Update Proxy",
		Address:   "socks4://health.proxy:1080",
		Protocol:  models.ProxyProtocolEnumPtr(models.ProxyProtocolSOCKS4),
		IsHealthy: false,
		CreatedAt: time.Now().UTC().Truncate(time.Millisecond),
		UpdatedAt: time.Now().UTC().Truncate(time.Millisecond),
	}
	err := proxyStore.CreateProxy(ctx, testDB, proxy)
	require.NoError(t, err)

	newHealth := true
	newLatency := sql.NullInt32{Int32: 120, Valid: true}
	newLastCheckedAt := time.Now().UTC().Truncate(time.Millisecond)

	err = proxyStore.UpdateProxyHealth(ctx, testDB, proxy.ID, newHealth, newLatency, newLastCheckedAt)
	assert.NoError(t, err)

	updated, err := proxyStore.GetProxyByID(ctx, testDB, proxy.ID)
	require.NoError(t, err)
	assert.Equal(t, newHealth, updated.IsHealthy)
	if newLatency.Valid {
		assert.True(t, updated.LatencyMs.Valid)
		assert.Equal(t, newLatency.Int32, updated.LatencyMs.Int32)
	} else {
		assert.False(t, updated.LatencyMs.Valid)
	}
	assert.Equal(t, newLastCheckedAt.UnixMilli(), updated.LastCheckedAt.Time.Truncate(time.Millisecond).UnixMilli(), "LastCheckedAt should represent the same instant")
	assert.True(t, updated.UpdatedAt.After(proxy.CreatedAt), "UpdatedAt should have been modified")

	// Test update health of non-existent proxy
	err = proxyStore.UpdateProxyHealth(ctx, testDB, uuid.New(), true, sql.NullInt32{}, time.Now())
	assert.ErrorIs(t, err, store.ErrNotFound)
}

func TestProxyStore_Transactionality(t *testing.T) {
	if testDB == nil {
		t.Skip("Skipping Postgres tests as TEST_POSTGRES_DSN is not set.")
	}
	proxyStore := NewProxyStorePostgres(testDB)
	ctx := context.Background()

	t.Run("commit transaction", func(t *testing.T) {
		clearProxiesTable(t)
		tx, err := proxyStore.BeginTxx(ctx, nil)
		require.NoError(t, err)

		proxy1 := &models.Proxy{ID: uuid.New(), Name: "TX Commit Proxy 1", Address: "http://tx.commit1:80", Protocol: models.ProxyProtocolEnumPtr(models.ProxyProtocolHTTP)}
		err = proxyStore.CreateProxy(ctx, tx, proxy1)
		require.NoError(t, err)

		err = tx.Commit()
		require.NoError(t, err)

		retrieved, err := proxyStore.GetProxyByID(ctx, testDB, proxy1.ID)
		assert.NoError(t, err)
		assert.NotNil(t, retrieved)
	})

	t.Run("rollback transaction", func(t *testing.T) {
		clearProxiesTable(t)
		tx, err := proxyStore.BeginTxx(ctx, nil)
		require.NoError(t, err)

		proxyToRollback := &models.Proxy{ID: uuid.New(), Name: "TX Rollback Proxy", Address: "http://tx.rollback:80", Protocol: models.ProxyProtocolEnumPtr(models.ProxyProtocolHTTP)}
		err = proxyStore.CreateProxy(ctx, tx, proxyToRollback)
		require.NoError(t, err)

		err = tx.Rollback()
		require.NoError(t, err)

		_, err = proxyStore.GetProxyByID(ctx, testDB, proxyToRollback.ID)
		assert.ErrorIs(t, err, store.ErrNotFound)
	})
}
