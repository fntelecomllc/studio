// File: backend/internal/api/api_utils.go
package api

import (
	//"context"
	"encoding/json"
	//"fmt"
	"log"
	"net/http"
	// No longer needed directly by this file after removing validatePersonaIDs
	// "github.com/fntelecomllc/studio/backend/internal/models"
	// "github.com/fntelecomllc/studio/backend/internal/store"
	// "github.com/google/uuid"
)

// DNScampaignAPIType is the canonical type string for DNS validation campaigns.
// This might be deprecated if we move to models.CampaignTypeEnum everywhere.
const DNScampaignAPIType = "DNS_VALIDATION"

// HTTPcampaignAPIType is the canonical type string for HTTP validation campaigns.
const HTTPcampaignAPIType = "HTTP_VALIDATION"

// MaxUploadSize defines the maximum upload size for files (e.g., domain lists).
const MaxUploadSize = 5 * 1024 * 1024 // 5 MB

// Constants for DomainInputSource, moved here for central access.
const (
	SourceTypeDNSCampaignPrefix = "dnsCampaignID:"
	SourceTypeFileUpload        = "fileUpload"
)

// RespondWithError sends a JSON error response (for net/http handlers).
// DEPRECATED: Use respondWithErrorGin for Gin handlers.
func RespondWithError(w http.ResponseWriter, code int, message string) {
	log.Printf("API Error (net/http): status=%d, message=%s", code, message)
	RespondWithJSON(w, code, map[string]string{"error": message})
}

// RespondWithJSON sends a JSON response (for net/http handlers).
// DEPRECATED: Use respondWithJSONGin for Gin handlers.
func RespondWithJSON(w http.ResponseWriter, code int, payload interface{}) {
	response, err := json.Marshal(payload)
	if err != nil {
		log.Printf("Error marshalling JSON response (net/http): %v", err)
		http.Error(w, "Internal Server Error: Could not marshal JSON response", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_, err = w.Write(response)
	if err != nil {
		log.Printf("Error writing JSON response body (net/http): %v", err)
	}
}

// Helper to get a Querier (either *sqlx.DB or *sqlx.Tx) from a store instance.
// This is useful if a utility function needs to perform read-only operations and the store itself is passed.
// func getQuerierFromStore(s interface{}) (store.Querier, error) {
// 	if querier, ok := s.(store.Querier); ok {
// 		return querier, nil
// 	}
// 	return nil, fmt.Errorf("store does not implement Querier interface")
// }
