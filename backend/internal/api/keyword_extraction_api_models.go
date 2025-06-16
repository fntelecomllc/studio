// File: backend/internal/api/keyword_extraction_api_models.go
package api

import (
	"github.com/fntelecomllc/studio/backend/internal/keywordextractor"
	//"github.com/google/uuid"
)

// KeywordExtractionRequestItem defines a single item in a batch keyword extraction request.
type KeywordExtractionRequestItem struct {
	URL           string  `json:"url" validate:"required,url"`
	HTTPPersonaID *string `json:"httpPersonaId,omitempty" validate:"omitempty,uuid"` // Optional: string representation of UUID
	DNSPersonaID  *string `json:"dnsPersonaId,omitempty" validate:"omitempty,uuid"`  // Optional: string representation of UUID
	KeywordSetID  string  `json:"keywordSetId" validate:"required,uuid"`             // Required: string representation of UUID
	// Add other per-item settings if needed, e.g., specific proxy to use
}

// BatchKeywordExtractionRequest is the request body for batch keyword extraction.
type BatchKeywordExtractionRequest struct {
	Items []KeywordExtractionRequestItem `json:"items" validate:"required,min=1,dive"`
}

// KeywordExtractionAPIResult defines the structure for a single keyword extraction result in the API response.
// It might differ slightly from keywordextractor.KeywordExtractionResult if API needs to format it.
type KeywordExtractionAPIResult struct {
	URL               string                                     `json:"url"`
	HTTPPersonaIDUsed *string                                    `json:"httpPersonaIdUsed,omitempty"` // String UUID of persona used
	DNSPersonaIDUsed  *string                                    `json:"dnsPersonaIdUsed,omitempty"`  // String UUID of persona used
	ProxyIDUsed       *string                                    `json:"proxyIdUsed,omitempty"`       // String UUID of proxy used
	KeywordSetIDUsed  string                                     `json:"keywordSetIdUsed"`
	Matches           []keywordextractor.KeywordExtractionResult `json:"matches,omitempty"`
	Error             string                                     `json:"error,omitempty"`
	FinalURL          string                                     `json:"finalUrl,omitempty"`
	StatusCode        int                                        `json:"statusCode,omitempty"`
}

// BatchKeywordExtractionResponse is the response body for batch keyword extraction.
type BatchKeywordExtractionResponse struct {
	Results []KeywordExtractionAPIResult `json:"results"`
}
