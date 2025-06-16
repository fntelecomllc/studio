package httpvalidator

import "time"

// ValidationResult holds the result of a single domain HTTP validation attempt.
// This can be from a standard HTTP client or a headless browser.
type ValidationResult struct {
	Domain                  string              `json:"domain"`             // The domain that was targeted
	AttemptedURL            string              `json:"attemptedUrl"`       // The initial URL attempted for validation
	FinalURL                string              `json:"finalUrl,omitempty"` // URL after all redirects
	IsSuccess               bool                `json:"isSuccess"`          // True if validation met persona criteria
	Status                  string              `json:"status"`             // Descriptive status, e.g., "Validated", "FetchError", "StatusCodeMismatch", "ContentMismatch", "HeadlessFailed"
	StatusCode              int                 `json:"statusCode,omitempty"`
	ResponseHeaders         map[string][]string `json:"responseHeaders,omitempty"`
	ContentHash             string              `json:"contentHash,omitempty"`             // SHA256 hash of the response body
	ContentLength           int                 `json:"contentLength,omitempty"`           // Length of body read for hashing/analysis
	ActualContentLength     int64               `json:"actualContentLength,omitempty"`     // From Content-Length header or full body if read
	ContentHashError        string              `json:"contentHashError,omitempty"`        // Error if hashing failed
	ExtractedTitle          string              `json:"extractedTitle,omitempty"`          // Extracted <title> from the page
	ExtractedContentSnippet string              `json:"extractedContentSnippet,omitempty"` // Extracted snippet of content
	AntiBotIndicators       map[string]string   `json:"antiBotIndicators,omitempty"`       // Detected anti-bot measures
	Error                   string              `json:"error,omitempty"`                   // Detailed error message if any step failed

	// Headless-specific results
	IsHeadless      bool   `json:"isHeadless,omitempty"`      // True if this result is from a headless browser attempt
	ScreenshotPath  string `json:"screenshotPath,omitempty"`  // Relative path to screenshot (if taken)
	DOMSnapshotPath string `json:"domSnapshotPath,omitempty"` // Relative path to DOM snapshot (if taken)

	Timestamp  time.Time `json:"timestamp"`  // Timestamp of when the validation attempt was made
	DurationMs int64     `json:"durationMs"` // Duration of the validation attempt in milliseconds

	UsedProxyID string `json:"usedProxyId,omitempty"` // ID of the proxy used for this validation

	RawBody []byte `json:"-"` // Raw response body, not included in JSON response by default, but available for internal processing
}
