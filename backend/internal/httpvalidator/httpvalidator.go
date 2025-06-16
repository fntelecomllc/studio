package httpvalidator

import (
	"bytes" // Required for bytes.NewReader
	"compress/gzip"
	"compress/zlib"
	"context"
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	//"regexp" // Added for title extraction
	"strings"
	"time"

	"github.com/fntelecomllc/studio/backend/internal/config"
	"github.com/fntelecomllc/studio/backend/internal/models"
	"golang.org/x/net/html" // Added for HTML parsing
)

const (
	defaultUserAgent           = "DomainFlowHTTPValidator/1.0"
	maxBodyReadSize      int64 = 5 * 1024 * 1024
	contentSnippetLength       = 256
)

func CanonicalHeaderKey(key string) string {
	return http.CanonicalHeaderKey(key)
}

type HTTPValidator struct {
	appConfig *config.AppConfig
}

func NewHTTPValidator(appCfg *config.AppConfig) *HTTPValidator {
	return &HTTPValidator{appConfig: appCfg}
}

// Function to extract title from HTML content
func extractTitle(n *html.Node) string {
	if n.Type == html.ElementNode && n.Data == "title" {
		if n.FirstChild != nil {
			return strings.TrimSpace(n.FirstChild.Data)
		}
	}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		title := extractTitle(c)
		if title != "" {
			return title
		}
	}
	return ""
}

func (hv *HTTPValidator) Validate(
	ctx context.Context,
	domain string,
	initialURL string,
	persona *models.Persona,
	proxy *models.Proxy,
) (*ValidationResult, error) {
	startTime := time.Now()
	result := &ValidationResult{
		Domain:       domain,
		AttemptedURL: initialURL,
		Timestamp:    startTime,
		IsSuccess:    false,
	}

	var personaCfg models.HTTPConfigDetails
	if persona != nil && persona.PersonaType == models.PersonaTypeHTTP && len(persona.ConfigDetails) > 0 {
		if err := json.Unmarshal(persona.ConfigDetails, &personaCfg); err != nil {
			log.Printf("HTTPValidator: Failed to unmarshal HTTP persona %s config: %v. Using app defaults.", persona.ID, err)
			personaCfg = config.DefaultHTTPConfigDetails(hv.appConfig.HTTPValidator)
		} else {
			log.Printf("HTTPValidator: Applying HTTP Persona %s (%s)", persona.Name, persona.ID)
		}
	} else {
		personaCfg = config.DefaultHTTPConfigDetails(hv.appConfig.HTTPValidator)
		if persona != nil {
			log.Printf("HTTPValidator: Persona %s is not HTTP type or has no ConfigDetails. Using app defaults.", persona.ID)
		} else {
			log.Printf("HTTPValidator: No persona provided for domain %s. Using app defaults.", domain)
		}
	}

	requestTimeout := hv.appConfig.HTTPValidator.RequestTimeout
	if personaCfg.RequestTimeoutSeconds > 0 {
		requestTimeout = time.Duration(personaCfg.RequestTimeoutSeconds) * time.Second
	}

	targetURLStr := initialURL
	if !strings.HasPrefix(targetURLStr, "http://") && !strings.HasPrefix(targetURLStr, "https://") {
		targetURLStr = "https://" + targetURLStr
		result.AttemptedURL = targetURLStr
	}

	parsedURL, err := url.Parse(targetURLStr)
	if err != nil {
		result.Error = fmt.Sprintf("Invalid target URL: %v", err)
		result.Status = "ErrorInvalidURL"
		result.DurationMs = time.Since(startTime).Milliseconds()
		return result, err
	}

	client := &http.Client{
		Timeout: requestTimeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			followRedirects := hv.appConfig.HTTPValidator.FollowRedirects
			if personaCfg.FollowRedirects != nil {
				followRedirects = *personaCfg.FollowRedirects
			}
			if !followRedirects {
				return http.ErrUseLastResponse
			}
			maxRedirects := hv.appConfig.HTTPValidator.MaxRedirects
			if len(via) >= maxRedirects {
				return http.ErrUseLastResponse
			}
			return nil
		},
	}

	tlsConfig := &tls.Config{
		InsecureSkipVerify: hv.appConfig.HTTPValidator.AllowInsecureTLS,
	}

	if proxy != nil && proxy.Address != "" && proxy.IsEnabled && proxy.IsHealthy {
		var protocol string
		if proxy.Protocol != nil {
			protocol = string(*proxy.Protocol)
		} else {
			protocol = "http" // default protocol
		}
		proxyFullURLStr := fmt.Sprintf("%s://%s", protocol, proxy.Address)
		proxyURL, parseErr := url.Parse(proxyFullURLStr)
		if parseErr != nil {
			result.Error = fmt.Sprintf("Invalid proxy URL '%s': %v", proxyFullURLStr, parseErr)
		} else {
			if proxy.Username.Valid && proxy.Username.String != "" {
				log.Printf("Warning: Authenticated proxy %s used, but plaintext password retrieval is not implemented in HTTPValidator.", proxy.ID)
			}
			client.Transport = &http.Transport{
				Proxy:           http.ProxyURL(proxyURL),
				TLSClientConfig: tlsConfig,
			}
			result.UsedProxyID = proxy.ID.String()
		}
	} else {
		client.Transport = &http.Transport{TLSClientConfig: tlsConfig}
	}

	req, err := http.NewRequestWithContext(ctx, "GET", parsedURL.String(), nil)
	if err != nil {
		result.Error = fmt.Sprintf("Failed to create request: %v", err)
		result.Status = "ErrorRequestCreation"
		result.DurationMs = time.Since(startTime).Milliseconds()
		return result, err
	}

	ua := personaCfg.UserAgent
	if ua == "" {
		ua = defaultUserAgent
	}
	req.Header.Set("User-Agent", ua)
	for key, value := range personaCfg.Headers {
		req.Header.Set(key, value)
	}

	resp, err := client.Do(req)
	if err != nil {
		result.Error = fmt.Sprintf("HTTP request failed: %v", err)
		result.Status = "ErrorFetchFailed"
		if urlErr, ok := err.(*url.Error); ok && urlErr.Timeout() {
			result.Status = "ErrorTimeout"
		}
		result.DurationMs = time.Since(startTime).Milliseconds()
		return result, err
	}
	defer resp.Body.Close()

	result.StatusCode = resp.StatusCode
	result.FinalURL = resp.Request.URL.String()

	result.ResponseHeaders = make(map[string][]string)
	for key, values := range resp.Header {
		result.ResponseHeaders[CanonicalHeaderKey(key)] = values
	}

	var reader io.Reader = resp.Body
	switch strings.ToLower(resp.Header.Get("Content-Encoding")) {
	case "gzip":
		gzReader, gzErr := gzip.NewReader(resp.Body)
		if gzErr == nil {
			defer gzReader.Close()
			reader = gzReader
		}
	case "deflate":
		zlibReader, zlibErr := zlib.NewReader(resp.Body)
		if zlibErr == nil {
			defer zlibReader.Close()
			reader = zlibReader
		}
	}

	maxRead := maxBodyReadSize
	if hv.appConfig.HTTPValidator.MaxBodyReadBytes > 0 {
		maxRead = hv.appConfig.HTTPValidator.MaxBodyReadBytes
	}
	limitedReader := io.LimitReader(reader, maxRead)
	bodyBytes, readErr := io.ReadAll(limitedReader)
	if readErr != nil {
		result.ContentHashError = fmt.Sprintf("Failed to read response body: %v", readErr)
	}
	result.RawBody = bodyBytes
	result.ContentLength = len(bodyBytes)

	if len(bodyBytes) > 0 {
		hash := sha256.Sum256(bodyBytes)
		result.ContentHash = hex.EncodeToString(hash[:])

		// Extract Title and Snippet if content type is HTML
		contentType := resp.Header.Get("Content-Type")
		if strings.Contains(strings.ToLower(contentType), "text/html") {
			doc, parseErr := html.Parse(bytes.NewReader(bodyBytes))
			if parseErr == nil {
				result.ExtractedTitle = extractTitle(doc)
			} else {
				log.Printf("HTTPValidator: Failed to parse HTML for title extraction from %s: %v", result.FinalURL, parseErr)
			}
		}
		if len(bodyBytes) > contentSnippetLength {
			result.ExtractedContentSnippet = string(bodyBytes[:contentSnippetLength]) + "..."
		} else {
			result.ExtractedContentSnippet = string(bodyBytes)
		}
	}

	result.IsSuccess = false
	allowedCodes := personaCfg.AllowedStatusCodes
	if len(allowedCodes) == 0 {
		if result.StatusCode >= 200 && result.StatusCode < 300 {
			result.IsSuccess = true
		}
	} else {
		for _, code := range allowedCodes {
			if result.StatusCode == code {
				result.IsSuccess = true
				break
			}
		}
	}

	if result.IsSuccess {
		result.Status = "Validated"
	} else {
		if result.Status == "" {
			result.Status = "FailedValidation"
		}
		if result.Error == "" {
			result.Error = fmt.Sprintf("Validation failed: Status code %d not in allowed list or other rule violation.", result.StatusCode)
		}
	}

	result.DurationMs = time.Since(startTime).Milliseconds()
	return result, nil
}

func (hv *HTTPValidator) ValidateHeadless(
	ctx context.Context, domain string, initialURL string,
	persona *models.Persona, proxy *models.Proxy,
) (*ValidationResult, error) {
	log.Printf("ValidateHeadless called for %s (Placeholder - Not Implemented)", domain)
	return &ValidationResult{
		Domain: domain, AttemptedURL: initialURL, Status: "ErrorNotImplemented", Error: "Headless validation is not implemented",
	}, fmt.Errorf("headless validation not implemented")
}
