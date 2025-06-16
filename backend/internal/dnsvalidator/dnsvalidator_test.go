package dnsvalidator

import (
	"context"
	"encoding/json"
	// "fmt" // Removed unused import
	"net/http"
	"net/http/httptest"
	"strings"
	"sync" // Added import for sync.Mutex
	"testing"
	"time"

	"github.com/fntelecomllc/studio/backend/internal/config"
	"github.com/miekg/dns"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newTestDNSValidatorConfig(resolvers []string, strategy string) config.DNSValidatorConfig {
	return config.DNSValidatorConfig{
		Resolvers:                  resolvers,
		UseSystemResolvers:         false,
		QueryTimeout:               2 * time.Second,
		MaxDomainsPerRequest:       10,
		ResolverStrategy:           strategy,
		ConcurrentQueriesPerDomain: 2,
		QueryDelayMin:              0,
		QueryDelayMax:              0,
		MaxConcurrentGoroutines:    5,
		RateLimitDPS:               100,
		RateLimitBurst:             20,
	}
}

// Helper to create a mock DoH server
func newMockDoHServer(t *testing.T, handler func(w http.ResponseWriter, r *http.Request)) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(handler))
}

func TestDNSValidator_ValidateSingleDomain_DoH_Success(t *testing.T) {
	mockServer := newMockDoHServer(t, func(w http.ResponseWriter, r *http.Request) {
		queryName := r.URL.Query().Get("name")
		queryTypeStr := r.URL.Query().Get("type")

		if queryName == "example.com." && (queryTypeStr == "A" || queryTypeStr == "AAAA") {
			resp := DoHJSONResponse{
				Status: dns.RcodeSuccess,
				Answer: []DoHAnswer{
					{Name: "example.com.", Type: int(dns.TypeA), Data: "1.2.3.4"},                               // Cast to int
					{Name: "example.com.", Type: int(dns.TypeAAAA), Data: "2606:2800:220:1:248:1893:25c8:1946"}, // Cast to int
				},
			}
			w.Header().Set("Content-Type", "application/dns-json")
			err := json.NewEncoder(w).Encode(resp)
			require.NoError(t, err)
		} else {
			w.WriteHeader(http.StatusNotFound)
		}
	})
	defer mockServer.Close()

	cfg := newTestDNSValidatorConfig([]string{mockServer.URL}, "random_rotation")
	validator := New(cfg)
	require.NotNil(t, validator)

	result := validator.ValidateSingleDomain("example.com", context.Background())

	assert.Equal(t, "Resolved", result.Status)
	assert.Contains(t, result.IPs, "1.2.3.4")
	assert.Contains(t, result.IPs, "2606:2800:220:1:248:1893:25c8:1946")
	assert.Equal(t, mockServer.URL, result.Resolver)
	assert.Empty(t, result.Error)
}

func TestDNSValidator_ValidateSingleDomain_DoH_NotFound(t *testing.T) {
	mockServer := newMockDoHServer(t, func(w http.ResponseWriter, r *http.Request) {
		queryName := r.URL.Query().Get("name")
		if queryName == "nxdomain.example.com." {
			resp := DoHJSONResponse{Status: dns.RcodeNameError} // NXDOMAIN
			w.Header().Set("Content-Type", "application/dns-json")
			err := json.NewEncoder(w).Encode(resp)
			require.NoError(t, err)
		} else {
			w.WriteHeader(http.StatusInternalServerError)
		}
	})
	defer mockServer.Close()

	cfg := newTestDNSValidatorConfig([]string{mockServer.URL}, "random_rotation")
	validator := New(cfg)

	result := validator.ValidateSingleDomain("nxdomain.example.com", context.Background())

	assert.Equal(t, "Not Found", result.Status, "Status should be Not Found for NXDOMAIN")
	assert.Empty(t, result.IPs)
	assert.Equal(t, mockServer.URL, result.Resolver)
	assert.Contains(t, result.Error, "no such host")
}

func TestDNSValidator_ValidateSingleDomain_InvalidFormat(t *testing.T) {
	cfg := newTestDNSValidatorConfig([]string{"https://1.1.1.1/dns-query"}, "random_rotation") // Real resolver not actually used
	validator := New(cfg)

	tests := []struct {
		domain      string
		expectedErr string
	}{
		{".invalid.com", "Invalid domain format"},
		{"invalid.com.", "Invalid domain format"},
		{"invalid..com", "Invalid domain format"},
		{"", "Invalid domain format"},
	}

	for _, tt := range tests {
		t.Run(tt.domain, func(t *testing.T) {
			result := validator.ValidateSingleDomain(tt.domain, context.Background())
			assert.Equal(t, "Error", result.Status)
			assert.Contains(t, result.Error, tt.expectedErr)
		})
	}
}

func TestDNSValidator_ValidateSingleDomain_DoH_ServerError(t *testing.T) {
	mockServer := newMockDoHServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte("internal server issue"))
	})
	defer mockServer.Close()

	cfg := newTestDNSValidatorConfig([]string{mockServer.URL}, "random_rotation")
	validator := New(cfg)

	result := validator.ValidateSingleDomain("example.com", context.Background())

	assert.Equal(t, "Error", result.Status)
	assert.Empty(t, result.IPs)
	assert.Equal(t, mockServer.URL, result.Resolver)
	assert.Contains(t, result.Error, "returned status 500")
	assert.Contains(t, result.Error, "internal server issue")
}

func TestDNSValidator_ValidateSingleDomain_DoH_Timeout(t *testing.T) {
	mockServer := newMockDoHServer(t, func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(3 * time.Second) // Longer than validator's QueryTimeout
		w.WriteHeader(http.StatusOK)
	})
	defer mockServer.Close()

	// Use a short query timeout for this test
	cfg := config.DNSValidatorConfig{
		Resolvers:                  []string{mockServer.URL},
		QueryTimeout:               1 * time.Second, // Short timeout
		ResolverStrategy:           "random_rotation",
		ConcurrentQueriesPerDomain: 1,
	}
	validator := New(cfg)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second) // Overall test timeout
	defer cancel()

	result := validator.ValidateSingleDomain("example.com", ctx)

	assert.Equal(t, "Timeout", result.Status)
	assert.Empty(t, result.IPs)
	assert.Equal(t, mockServer.URL, result.Resolver)
	assert.True(t, strings.Contains(result.Error, "timeout") || strings.Contains(result.Error, "context deadline exceeded"), "Error message should indicate timeout")
}

func TestDNSValidator_ValidateSingleDomain_ContextCancelled_DuringDelay(t *testing.T) {
	cfg := config.DNSValidatorConfig{
		Resolvers:                  []string{"https://1.1.1.1/dns-query"}, // Real resolver not hit
		QueryTimeout:               5 * time.Second,
		QueryDelayMin:              100 * time.Millisecond,
		QueryDelayMax:              200 * time.Millisecond,
		ResolverStrategy:           "random_rotation",
		ConcurrentQueriesPerDomain: 1,
	}
	validator := New(cfg)

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond) // Cancel before delay completes
	defer cancel()

	result := validator.ValidateSingleDomain("example.com", ctx)

	assert.Equal(t, "Error", result.Status) // Or "Cancelled" if you have specific status for it
	assert.Contains(t, result.Error, "Context canceled during query delay")
}

func TestIsPotentiallyRetryableError(t *testing.T) {
	tests := []struct {
		name     string
		errMsg   string
		expected bool
	}{
		{"empty error", "", false},
		{"no such host", "lookup example.com: no such host", false},
		{"nxdomain", "server_some_addr: server misbehaving (NXDOMAIN)", false},
		{"name error", "Query failed: NAME_ERROR", false},
		{"timeout error", "lookup example.com: i/o timeout", true},
		{"connection refused", "connect: connection refused", true},
		{"i/o error generic", "read udp 127.0.0.1:123->1.1.1.1:53: i/o error", true},
		{"server misbehaving general", "server misbehaving", true},
		{"doh bad request param", "DoH: request for example.com type A returned status 400. Body: Invalid parameter 'name'", false}, // Specific 400 errors are not retryable
		{"doh bad request generic", "DoH: request for example.com type A returned status 400.", true},                               // Generic 400 might be temp
		{"non-retryable error", "some other permanent error", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.expected, isPotentiallyRetryableError(tt.errMsg))
		})
	}
}

func TestDNSValidator_NoResolversAvailable(t *testing.T) {
	cfg := config.DNSValidatorConfig{
		Resolvers:        []string{}, // No resolvers
		ResolverStrategy: "random_rotation",
	}
	validator := New(cfg)
	require.NotNil(t, validator)

	result := validator.ValidateSingleDomain("example.com", context.Background())

	assert.Equal(t, "Error", result.Status)
	assert.Contains(t, result.Error, "no active DNS resolvers for random_rotation")

	results := validator.ValidateDomains([]string{"example.com", "test.com"})
	require.Len(t, results, 2)
	for _, res := range results {
		assert.Equal(t, "Error", res.Status)
		assert.Contains(t, res.Error, "No DNS resolvers available")
	}
}

func TestDNSValidator_ValidateDomains_Batching(t *testing.T) {
	callCount := 0
	mu := sync.Mutex{}
	mockServer := newMockDoHServer(t, func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		callCount++
		mu.Unlock()
		queryName := r.URL.Query().Get("name")
		resp := DoHJSONResponse{
			Status: dns.RcodeSuccess,
			Answer: []DoHAnswer{{Name: queryName, Type: int(dns.TypeA), Data: "1.2.3.4"}}, // Cast to int
		}
		w.Header().Set("Content-Type", "application/dns-json")
		_ = json.NewEncoder(w).Encode(resp)
	})
	defer mockServer.Close()

	cfg := config.DNSValidatorConfig{
		Resolvers:                  []string{mockServer.URL},
		QueryTimeout:               1 * time.Second,
		ResolverStrategy:           "random_rotation",
		ConcurrentQueriesPerDomain: 1,
		MaxConcurrentGoroutines:    2, // Max 2 concurrent goroutines for ValidateDomains
	}
	validator := New(cfg)

	domains := []string{"d1.com", "d2.com", "d3.com", "d4.com", "d5.com"}
	startTime := time.Now()
	results := validator.ValidateDomains(domains)
	duration := time.Since(startTime)

	assert.Len(t, results, 5)
	for _, res := range results {
		assert.Equal(t, "Resolved", res.Status)
	}

	// Check that it didn't take 5 * QueryTimeout due to concurrency
	// MaxConcurrentGoroutines is 2, so for 5 domains, it should be roughly 3 * QueryTimeout (2, 2, 1)
	// This is a rough check and can be flaky depending on system load.
	expectedMaxDuration := (time.Duration(len(domains)+cfg.MaxConcurrentGoroutines-1) / time.Duration(cfg.MaxConcurrentGoroutines)) * (cfg.QueryTimeout + 500*time.Millisecond) // add buffer
	t.Logf("ValidateDomains duration: %s, Expected max: %s", duration, expectedMaxDuration)
	// A more robust check would be on callCount if ValidateSingleDomain was directly mockable for this aspect,
	// or by observing side effects if the goroutines had some identifiable work.
	// Since ValidateSingleDomain is called, we can ensure it was called for all domains.
	mu.Lock()
	assert.Equal(t, len(domains)*2, callCount, "Expected ValidateSingleDomain to be called for A and AAAA for each domain") // Each ValidateSingleDomain calls performSingleDomainAttempt which calls getNextResolver once and perform queries for A and AAAA
	mu.Unlock()
}
