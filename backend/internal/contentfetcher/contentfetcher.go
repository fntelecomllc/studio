package contentfetcher

import (
	"bytes"
	"compress/gzip"
	"compress/zlib"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net"
	"net/http"
	"net/http/cookiejar"
	"strings"
	"sync" // Added for mutex in resolver state
	"time"

	"github.com/fntelecomllc/studio/backend/internal/config"
	"github.com/fntelecomllc/studio/backend/internal/models"
	"github.com/fntelecomllc/studio/backend/internal/proxymanager"
	"github.com/google/uuid"
	"golang.org/x/net/html/charset"
)

// ContentFetcher is responsible for fetching URL content with persona and proxy support.
type ContentFetcher struct {
	appConfig *config.AppConfig
	proxyMgr  *proxymanager.ProxyManager
}

// dnsResolverState holds state for a specific DNS persona's resolver strategy within a single fetch operation.
// This is simpler than DNSValidator's state as it's per-fetch, not global.
type dnsResolverState struct {
	personaConfig     models.DNSConfigDetails
	resolvers         []string // Effective list of resolvers based on strategy
	currentIndex      int
	mu                sync.Mutex
	weightedResolvers []string // For weighted_rotation, expanded list
	preferredOrderIdx int      // For sequential_failover
}

// newDNSResolverState initializes a resolver state based on persona config.
func newDNSResolverState(cfg models.DNSConfigDetails) *dnsResolverState {
	rs := &dnsResolverState{
		personaConfig: cfg,
		resolvers:     append([]string{}, cfg.Resolvers...), // Create a copy to shuffle/modify safely
	}

	switch strings.ToLower(cfg.ResolverStrategy) {
	case "sequential_failover":
		if len(cfg.ResolversPreferredOrder) > 0 {
			var preferred []string
			mainResolverMap := make(map[string]bool)
			for _, r := range cfg.Resolvers {
				mainResolverMap[r] = true
			}
			for _, pr := range cfg.ResolversPreferredOrder {
				if mainResolverMap[pr] {
					preferred = append(preferred, pr)
				}
			}
			if len(preferred) > 0 {
				rs.resolvers = preferred
			} else {
				log.Printf("ContentFetcher: DNS sequential_failover specified but no valid preferred resolvers. Using original list as is.")
			}
		}
	case "weighted_rotation":
		if len(cfg.ResolversWeighted) > 0 {
			rs.weightedResolvers = []string{} // Initialize
			for addr, weight := range cfg.ResolversWeighted {
				if weight <= 0 {
					continue
				}
				for i := 0; i < weight; i++ {
					rs.weightedResolvers = append(rs.weightedResolvers, addr)
				}
			}
			if len(rs.weightedResolvers) > 0 {
				rand.Shuffle(len(rs.weightedResolvers), func(i, j int) {
					rs.weightedResolvers[i], rs.weightedResolvers[j] = rs.weightedResolvers[j], rs.weightedResolvers[i]
				})
				rs.resolvers = rs.weightedResolvers
			} else {
				log.Printf("ContentFetcher: DNS weighted_rotation specified but no valid weighted resolvers. Falling back to random on original list.")
				if len(rs.resolvers) > 0 { // Ensure rs.resolvers has content before shuffling
					rand.Shuffle(len(rs.resolvers), func(i, j int) { rs.resolvers[i], rs.resolvers[j] = rs.resolvers[j], rs.resolvers[i] })
				}
			}
		} else {
			if len(rs.resolvers) > 0 { // Ensure rs.resolvers has content before shuffling
				rand.Shuffle(len(rs.resolvers), func(i, j int) { rs.resolvers[i], rs.resolvers[j] = rs.resolvers[j], rs.resolvers[i] })
			}
		}
	case "random_rotation":
		fallthrough
	default:
		if len(rs.resolvers) > 0 {
			rand.Shuffle(len(rs.resolvers), func(i, j int) { rs.resolvers[i], rs.resolvers[j] = rs.resolvers[j], rs.resolvers[i] })
		}
	}
	return rs
}

func (rs *dnsResolverState) getNextResolver() (string, error) {
	rs.mu.Lock()
	defer rs.mu.Unlock()

	if len(rs.resolvers) == 0 {
		return "", fmt.Errorf("no DNS resolvers available in state")
	}

	var resolverAddr string
	strategy := strings.ToLower(rs.personaConfig.ResolverStrategy)

	if strategy == "sequential_failover" {
		if rs.preferredOrderIdx >= len(rs.resolvers) {
			return "", fmt.Errorf("all preferred resolvers exhausted for sequential_failover")
		}
		resolverAddr = rs.resolvers[rs.preferredOrderIdx]
	} else {
		resolverAddr = rs.resolvers[rs.currentIndex%len(rs.resolvers)]
		rs.currentIndex++
	}
	return resolverAddr, nil
}

func NewContentFetcher(appCfg *config.AppConfig, proxyMgr *proxymanager.ProxyManager) *ContentFetcher {
	if appCfg == nil {
		appCfg = &config.AppConfig{
			HTTPValidator: config.HTTPValidatorConfig{RequestTimeoutSeconds: 30, MaxRedirects: 7, FollowRedirects: true, AllowInsecureTLS: false},
			DNSValidator:  config.DNSValidatorConfig{QueryTimeoutSeconds: 5},
		}
	}
	return &ContentFetcher{appConfig: appCfg, proxyMgr: proxyMgr}
}

func (cf *ContentFetcher) FetchUsingPersonas(
	ctx context.Context,
	urlStr string,
	httpModelPersona *models.Persona,
	dnsModelPersona *models.Persona,
	modelProxy *models.Proxy,
) (body []byte, finalURL string, statusCode int, httpPersonaIDUsed *uuid.UUID, dnsPersonaIDUsed *uuid.UUID, proxyIDUsed *uuid.UUID, err error) {

	httpClient, effectiveUA, effectiveHeaders, _, usedProxyConfigEntry, actualDNSPIDUsed := cf.createConfiguredClient(
		ctx,
		httpModelPersona,
		dnsModelPersona,
		modelProxy,
	)

	if httpModelPersona != nil {
		httpPersonaIDUsed = &httpModelPersona.ID
	}
	if actualDNSPIDUsed != nil {
		dnsPersonaIDUsed = actualDNSPIDUsed
	}
	if usedProxyConfigEntry != nil {
		if modelProxy != nil && usedProxyConfigEntry.ID == modelProxy.ID.String() {
			proxyIDUsed = &modelProxy.ID
		} else if modelProxy == nil && usedProxyConfigEntry.ID != "" {
			parsedProxyID, pErr := uuid.Parse(usedProxyConfigEntry.ID)
			if pErr == nil {
				proxyIDUsed = &parsedProxyID
			}
		}
	}

	shouldTryHTTP := false
	if !strings.HasPrefix(urlStr, "http://") && !strings.HasPrefix(urlStr, "https://") {
		urlStr = "https://" + urlStr
		shouldTryHTTP = true
	}

	urlsToTry := []string{urlStr}
	if shouldTryHTTP && strings.HasPrefix(urlStr, "https://") {
		urlsToTry = append(urlsToTry, strings.Replace(urlStr, "https://", "http://", 1))
	}

	var resp *http.Response
	var lastReqError error

	for _, currentURLToTry := range urlsToTry {
		log.Printf("ContentFetcher: Attempting URL: %s (UA: %s)", currentURLToTry, effectiveUA)
		req, errNewReq := http.NewRequestWithContext(ctx, "GET", currentURLToTry, nil)
		if errNewReq != nil {
			lastReqError = fmt.Errorf("failed to create request for %s: %w", currentURLToTry, errNewReq)
			continue
		}

		req.Header.Set("User-Agent", effectiveUA)
		for key, value := range effectiveHeaders {
			req.Header.Set(key, value)
		}
		if _, ok := effectiveHeaders["Accept"]; !ok {
			req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7")
		}
		if _, ok := effectiveHeaders["Accept-Language"]; !ok {
			req.Header.Set("Accept-Language", "en-US,en;q=0.9")
		}

		currentResp, doErr := httpClient.Do(req)
		if doErr != nil {
			lastReqError = fmt.Errorf("request to %s failed: %w", currentURLToTry, doErr)
			if currentResp != nil {
				currentResp.Body.Close()
			}
			if ctx.Err() != nil {
				return nil, "", 0, httpPersonaIDUsed, dnsPersonaIDUsed, proxyIDUsed, fmt.Errorf("context cancelled for %s: %w", currentURLToTry, ctx.Err())
			}
			continue
		}
		resp = currentResp
		lastReqError = nil
		break
	}

	if lastReqError != nil {
		if usedProxyConfigEntry != nil && cf.proxyMgr != nil && proxymanager.IsProxyRelatedError(lastReqError.Error(), usedProxyConfigEntry.Address) {
			cf.proxyMgr.ReportProxyHealth(usedProxyConfigEntry.ID, false, lastReqError)
		}
		return nil, "", 0, httpPersonaIDUsed, dnsPersonaIDUsed, proxyIDUsed, lastReqError
	}

	if resp == nil {
		return nil, "", 0, httpPersonaIDUsed, dnsPersonaIDUsed, proxyIDUsed, fmt.Errorf("no response received after trying URLs: %v", urlsToTry)
	}
	defer resp.Body.Close()

	finalURL = resp.Request.URL.String()
	statusCode = resp.StatusCode

	if usedProxyConfigEntry != nil && cf.proxyMgr != nil {
		cf.proxyMgr.ReportProxyHealth(usedProxyConfigEntry.ID, true, nil)
	}

	body, readErr := cf.readAndProcessBody(resp)
	if readErr != nil {
		return nil, finalURL, statusCode, httpPersonaIDUsed, dnsPersonaIDUsed, proxyIDUsed, fmt.Errorf("error reading/processing body from %s: %w", finalURL, readErr)
	}

	log.Printf("ContentFetcher: Successfully fetched %s (Status: %d, Size: %d, Final URL: %s)", urlStr, statusCode, len(body), finalURL)
	return body, finalURL, statusCode, httpPersonaIDUsed, dnsPersonaIDUsed, proxyIDUsed, nil
}

func (cf *ContentFetcher) createConfiguredClient(
	_ context.Context, // Renamed ctx to _ as it's not used directly in this method
	httpModelPersona *models.Persona,
	dnsModelPersona *models.Persona,
	modelProxy *models.Proxy,
) (client *http.Client, userAgent string, headers map[string]string, maxRedirects int, usedProxyRef *config.ProxyConfigEntry, actualDNSPersonaID *uuid.UUID) {

	var httpPersonaCfg models.HTTPConfigDetails
	var dnsPersonaCfg models.DNSConfigDetails
	var resolverState *dnsResolverState // Defined above

	if httpModelPersona != nil && httpModelPersona.PersonaType == models.PersonaTypeHTTP && len(httpModelPersona.ConfigDetails) > 0 {
		if err := json.Unmarshal(httpModelPersona.ConfigDetails, &httpPersonaCfg); err != nil {
			log.Printf("ContentFetcher: Failed to unmarshal HTTP persona %s config: %v. Using app defaults.", httpModelPersona.ID, err)
			httpPersonaCfg = config.DefaultHTTPConfigDetails(cf.appConfig.HTTPValidator)
		} else {
			log.Printf("ContentFetcher: Applying HTTP Persona %s (%s)", httpModelPersona.Name, httpModelPersona.ID)
		}
	} else {
		httpPersonaCfg = config.DefaultHTTPConfigDetails(cf.appConfig.HTTPValidator)
		if httpModelPersona != nil {
			log.Printf("ContentFetcher: HTTP Persona %s invalid or no config. Using app defaults.", httpModelPersona.ID)
		}
	}

	effectiveUserAgent := httpPersonaCfg.UserAgent
	if effectiveUserAgent == "" {
		effectiveUserAgent = cf.appConfig.HTTPValidator.DefaultUserAgent
	}
	if effectiveUserAgent == "" {
		effectiveUserAgent = "DomainFlowContentFetcher/1.1"
	}

	effectiveHeaders := make(map[string]string)
	for k, v := range cf.appConfig.HTTPValidator.DefaultHeaders {
		effectiveHeaders[k] = v
	}
	for k, v := range httpPersonaCfg.Headers {
		effectiveHeaders[k] = v
	}

	effectiveMaxRedirects := cf.appConfig.HTTPValidator.MaxRedirects
	followRedirects := cf.appConfig.HTTPValidator.FollowRedirects
	if httpPersonaCfg.FollowRedirects != nil {
		followRedirects = *httpPersonaCfg.FollowRedirects
	}
	if !followRedirects {
		effectiveMaxRedirects = 0
	}

	defaultDialer := &net.Dialer{
		Timeout:   30 * time.Second,
		KeepAlive: 30 * time.Second,
	}
	dialContextFunc := defaultDialer.DialContext

	if dnsModelPersona != nil && dnsModelPersona.PersonaType == models.PersonaTypeDNS && len(dnsModelPersona.ConfigDetails) > 0 {
		if err := json.Unmarshal(dnsModelPersona.ConfigDetails, &dnsPersonaCfg); err != nil {
			log.Printf("ContentFetcher: Failed to unmarshal DNS persona %s config: %v. Using system DNS.", dnsModelPersona.ID, err)
		} else {
			if len(dnsPersonaCfg.Resolvers) > 0 {
				log.Printf("ContentFetcher: Applying DNS Persona %s (%s) with strategy '%s' and resolvers: %v",
					dnsModelPersona.Name, dnsModelPersona.ID, dnsPersonaCfg.ResolverStrategy, dnsPersonaCfg.Resolvers)
				actualDNSPersonaID = &dnsModelPersona.ID
				resolverState = newDNSResolverState(dnsPersonaCfg)

				customResolverDialFunc := func(ctxDial context.Context, network, address string) (net.Conn, error) {
					rs := resolverState
					var lastDialErr error
					numAttempts := 1
					if strings.ToLower(rs.personaConfig.ResolverStrategy) == "sequential_failover" {
						numAttempts = len(rs.resolvers) // Attempt all resolvers in preferred order
					}

					for attempt := 0; attempt < numAttempts; attempt++ {
						// For sequential, getNextResolver will use preferredOrderIdx; for others, it uses currentIndex
						resolverAddr, errGetNext := rs.getNextResolver()
						if errGetNext != nil {
							lastDialErr = fmt.Errorf("failed to get resolver for attempt %d: %w", attempt, errGetNext)
							break
						}
						if !strings.Contains(resolverAddr, ":") {
							resolverAddr = net.JoinHostPort(resolverAddr, "53")
						}
						dnsTimeout := time.Duration(rs.personaConfig.QueryTimeoutSeconds) * time.Second
						if dnsTimeout <= 0 {
							dnsTimeout = 5 * time.Second
						}
						d := net.Dialer{Timeout: dnsTimeout}

						conn, dialErr := d.DialContext(ctxDial, network, resolverAddr)
						if dialErr == nil {
							rs.mu.Lock()
							rs.preferredOrderIdx = 0 // Reset for next host resolution by this client if sequential succeeded
							rs.mu.Unlock()
							return conn, nil
						}
						lastDialErr = dialErr
						if strings.ToLower(rs.personaConfig.ResolverStrategy) == "sequential_failover" {
							rs.mu.Lock()
							rs.preferredOrderIdx++ // Advance to next preferred resolver for the *next call to getNextResolver*
							rs.mu.Unlock()
							log.Printf("ContentFetcher: DNS dial via %s failed for %s (attempt %d/%d): %v. Trying next for sequential.", resolverAddr, address, attempt+1, numAttempts, dialErr)
						} else {
							break // For random/weighted, one attempt per getNextResolver call is sufficient
						}
					}
					return nil, fmt.Errorf("all DNS dial attempts failed for %s via persona %s; last error: %w", address, dnsModelPersona.ID, lastDialErr)
				}

				netResolver := &net.Resolver{
					PreferGo: true,
					Dial:     customResolverDialFunc,
				}

				dialContextFunc = func(ctxDialNetHost context.Context, network, addr string) (net.Conn, error) {
					host, port, errSplit := net.SplitHostPort(addr)
					if errSplit != nil {
						return nil, errSplit
					}
					if net.ParseIP(host) != nil {
						return defaultDialer.DialContext(ctxDialNetHost, network, addr)
					}

					ips, resolveErr := netResolver.LookupIPAddr(ctxDialNetHost, host)
					if resolveErr != nil || len(ips) == 0 {
						return nil, fmt.Errorf("DNS persona %s LookupIPAddr failed for %s: %w", dnsModelPersona.ID, host, resolveErr)
					}
					return defaultDialer.DialContext(ctxDialNetHost, network, net.JoinHostPort(ips[0].String(), port))
				}
			} else {
				log.Printf("ContentFetcher: DNS Persona %s has no resolvers defined. Using system DNS.", dnsModelPersona.ID)
			}
		}
	} else if dnsModelPersona != nil {
		log.Printf("ContentFetcher: DNS Persona %s invalid or no config. Using system DNS.", dnsModelPersona.ID)
	}

	baseTransport := &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		DialContext:           dialContextFunc,
		TLSClientConfig:       &tls.Config{InsecureSkipVerify: cf.appConfig.HTTPValidator.AllowInsecureTLS},
		ForceAttemptHTTP2:     true, // Default, will be overridden by persona if specified
		MaxIdleConns:          100,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		MaxIdleConnsPerHost:   10,
		ResponseHeaderTimeout: time.Duration(httpPersonaCfg.RequestTimeoutSeconds) * time.Second,
	}
	if baseTransport.ResponseHeaderTimeout <= 0 {
		baseTransport.ResponseHeaderTimeout = cf.appConfig.HTTPValidator.RequestTimeout
	}

	// Apply HTTP/2 setting from persona AFTER baseTransport is initialized
	if httpPersonaCfg.HTTP2Settings != nil {
		baseTransport.ForceAttemptHTTP2 = httpPersonaCfg.HTTP2Settings.Enabled
		log.Printf("ContentFetcher: HTTP/2 ForceAttempt set to %v based on persona %s", httpPersonaCfg.HTTP2Settings.Enabled, httpModelPersona.ID)
	}

	currentRoundTripper := http.RoundTripper(baseTransport)
	var tempUsedProxyRef *config.ProxyConfigEntry

	if modelProxy != nil && modelProxy.IsEnabled && modelProxy.IsHealthy {
		var protocolStr string
		if modelProxy.Protocol != nil {
			protocolStr = string(*modelProxy.Protocol)
		}
		proxyCfgEntry := config.ProxyConfigEntry{
			ID:       modelProxy.ID.String(),
			Protocol: protocolStr,
			Address:  modelProxy.Address,
			Username: modelProxy.Username.String,
		}
		log.Printf("ContentFetcher: Using provided models.Proxy ID '%s'", modelProxy.ID)
		proxyTransport, errTransport := proxymanager.GetHTTPTransportForProxy(&proxyCfgEntry, baseTransport)
		if errTransport == nil && proxyTransport != nil {
			currentRoundTripper = proxyTransport
			tempUsedProxyRef = &proxyCfgEntry
		} else {
			log.Printf("ContentFetcher: Failed to configure transport for provided proxy ID '%s': %v. Using direct.", modelProxy.ID, errTransport)
		}
	} else if cf.proxyMgr != nil {
		pEntry, err := cf.proxyMgr.GetProxy()
		if err == nil && pEntry != nil {
			log.Printf("ContentFetcher: Using proxy ID '%s' from ProxyManager", pEntry.ID)
			proxyTransport, errTransport := proxymanager.GetHTTPTransportForProxy(pEntry, baseTransport)
			if errTransport == nil && proxyTransport != nil {
				currentRoundTripper = proxyTransport
				tempUsedProxyRef = pEntry
			} else {
				log.Printf("ContentFetcher: Failed to get/configure transport for manager proxy ID '%s': %v. Using direct.", pEntry.ID, errTransport)
			}
		} else {
			log.Printf("ContentFetcher: No healthy proxy from ProxyManager (%v). Using direct.", err)
		}
	}

	var jar http.CookieJar
	if httpPersonaCfg.CookieHandling != nil && strings.ToLower(httpPersonaCfg.CookieHandling.Mode) == "session" {
		var jarErr error
		jar, jarErr = cookiejar.New(nil)
		if jarErr != nil {
			log.Printf("ContentFetcher: Error creating cookie jar: %v", jarErr)
		}
	}

	finalClient := &http.Client{
		Transport: currentRoundTripper,
		Jar:       jar,
		Timeout:   time.Duration(httpPersonaCfg.RequestTimeoutSeconds) * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= effectiveMaxRedirects {
				return http.ErrUseLastResponse
			}
			return nil
		},
	}
	if finalClient.Timeout <= 0 {
		finalClient.Timeout = cf.appConfig.HTTPValidator.RequestTimeout
	}

	return finalClient, effectiveUserAgent, effectiveHeaders, effectiveMaxRedirects, tempUsedProxyRef, actualDNSPersonaID
}

func (cf *ContentFetcher) readAndProcessBody(resp *http.Response) ([]byte, error) {
	var reader io.Reader = resp.Body

	switch strings.ToLower(resp.Header.Get("Content-Encoding")) {
	case "gzip":
		gzReader, gzErr := gzip.NewReader(resp.Body)
		if gzErr != nil {
			return nil, fmt.Errorf("gzip reader error: %w", gzErr)
		}
		defer gzReader.Close()
		reader = gzReader
	case "deflate":
		zlibReader, zlibErr := zlib.NewReader(resp.Body)
		if zlibErr != nil {
			return nil, fmt.Errorf("deflate reader error: %w", zlibErr)
		}
		defer zlibReader.Close()
		reader = zlibReader
	}

	limitedReader := io.LimitReader(reader, cf.appConfig.HTTPValidator.MaxBodyReadBytes)
	rawBodyBytes, readErr := io.ReadAll(limitedReader)
	if readErr != nil && readErr != io.EOF {
		return nil, fmt.Errorf("error reading response body (limit %dMB): %w", cf.appConfig.HTTPValidator.MaxBodyReadBytes/(1024*1024), readErr)
	}

	contentType := resp.Header.Get("Content-Type")
	utf8Reader, errConv := charset.NewReader(bytes.NewReader(rawBodyBytes), contentType)
	if errConv != nil {
		log.Printf("ContentFetcher: Could not get UTF-8 reader for %s (ContentType: '%s'): %v. Using raw (decompressed) bytes.", resp.Request.URL, contentType, errConv)
		return rawBodyBytes, nil
	}

	utf8Bytes, errReadUTF8 := io.ReadAll(utf8Reader)
	if errReadUTF8 != nil {
		log.Printf("ContentFetcher: Error reading as UTF-8 from %s: %v. Using raw (decompressed) bytes.", resp.Request.URL, errReadUTF8)
		return rawBodyBytes, nil
	}
	return utf8Bytes, nil
}
