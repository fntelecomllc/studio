// File: backend/internal/api/campaign_orchestrator_handlers.go
package api

import (
	"fmt"
	"log"
	"net/http"
	"strconv"

	"github.com/fntelecomllc/studio/backend/internal/middleware"
	"github.com/fntelecomllc/studio/backend/internal/models"
	"github.com/fntelecomllc/studio/backend/internal/services"
	"github.com/fntelecomllc/studio/backend/internal/store" // Added for store.ListCampaignsFilter
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	// Assuming store is imported if store.ErrNotFound is used, or it's a type alias/variable
	// For example: "github.com/fntelecomllc/studio/backend/internal/store"
	// Or if it's a common error package: "errors" and then use errors.Is(err, store.ErrNotFound)
)

// CampaignOrchestratorAPIHandler holds dependencies for campaign orchestration API endpoints.
type CampaignOrchestratorAPIHandler struct {
	orchestratorService services.CampaignOrchestratorService
	// No direct store access needed here, orchestrator service handles it.
}

// NewCampaignOrchestratorAPIHandler creates a new handler for campaign orchestration.
func NewCampaignOrchestratorAPIHandler(orchService services.CampaignOrchestratorService) *CampaignOrchestratorAPIHandler {
	return &CampaignOrchestratorAPIHandler{orchestratorService: orchService}
}

// RegisterCampaignOrchestrationRoutes registers all campaign orchestration related routes.
// It requires a base group and auth middleware instance for permission-based access control.
func (h *CampaignOrchestratorAPIHandler) RegisterCampaignOrchestrationRoutes(group *gin.RouterGroup, authMiddleware *middleware.AuthMiddleware) {
	// Campaign creation routes - require campaigns:create permission
	group.POST("/generate", authMiddleware.RequirePermission("campaigns:create"), h.createDomainGenerationCampaign)
	group.POST("/dns-validate", authMiddleware.RequirePermission("campaigns:create"), h.createDNSValidationCampaign)
	group.POST("/http-validate", authMiddleware.RequirePermission("campaigns:create"), h.createHTTPKeywordCampaign)
	group.POST("/keyword-validate", authMiddleware.RequirePermission("campaigns:create"), h.createHTTPKeywordCampaign)

	// Campaign reading routes - require campaigns:read permission
	group.GET("", authMiddleware.RequirePermission("campaigns:read"), h.listCampaigns)
	group.GET("/:campaignId", authMiddleware.RequirePermission("campaigns:read"), h.getCampaignDetails)
	group.GET("/:campaignId/status", authMiddleware.RequirePermission("campaigns:read"), h.getCampaignStatus)

	// Campaign control routes - require campaigns:execute permission
	group.POST("/:campaignId/start", authMiddleware.RequirePermission("campaigns:execute"), h.startCampaign)
	group.POST("/:campaignId/pause", authMiddleware.RequirePermission("campaigns:execute"), h.pauseCampaign)
	group.POST("/:campaignId/resume", authMiddleware.RequirePermission("campaigns:execute"), h.resumeCampaign)
	group.POST("/:campaignId/cancel", authMiddleware.RequirePermission("campaigns:execute"), h.cancelCampaign)

	// Campaign modification routes - require campaigns:update permission
	group.PUT("/:campaignId", authMiddleware.RequirePermission("campaigns:update"), h.updateCampaign)

	// Campaign deletion routes - require campaigns:delete permission
	group.DELETE("/:campaignId", authMiddleware.RequirePermission("campaigns:delete"), h.deleteCampaign)

	// Campaign results routes - require campaigns:read permission
	group.GET("/:campaignId/results/generated-domains", authMiddleware.RequirePermission("campaigns:read"), h.getGeneratedDomains)
	group.GET("/:campaignId/results/dns-validation", authMiddleware.RequirePermission("campaigns:read"), h.getDNSValidationResults)
	group.GET("/:campaignId/results/http-keyword", authMiddleware.RequirePermission("campaigns:read"), h.getHTTPKeywordResults)
}

// --- Campaign Creation Handlers ---

func (h *CampaignOrchestratorAPIHandler) createDomainGenerationCampaign(c *gin.Context) {
	var req services.CreateDomainGenerationCampaignRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		// Use validation error response for binding errors
		var validationErrors []ErrorDetail
		validationErrors = append(validationErrors, ErrorDetail{
			Field:   "body",
			Code:    ErrorCodeValidation,
			Message: "Invalid request payload: " + err.Error(),
		})
		respondWithValidationErrorGin(c, validationErrors)
		return
	}

	// Validate struct if validator is available
	if validate != nil {
		if err := validate.Struct(req); err != nil {
			// Convert validation errors to ErrorDetail slice
			var validationErrors []ErrorDetail
			// Handle validation errors properly - this is a simplified version
			validationErrors = append(validationErrors, ErrorDetail{
				Code:    ErrorCodeValidation,
				Message: "Validation failed: " + err.Error(),
			})
			respondWithValidationErrorGin(c, validationErrors)
			return
		}
	}

	campaign, err := h.orchestratorService.CreateDomainGenerationCampaign(c.Request.Context(), req)
	if err != nil {
		log.Printf("Error creating domain generation campaign: %v", err)
		// Use detailed error response with appropriate error code
		respondWithDetailedErrorGin(c, http.StatusInternalServerError, ErrorCodeInternalServer,
			"Failed to create domain generation campaign", []ErrorDetail{
				{
					Code:    ErrorCodeInternalServer,
					Message: err.Error(),
					Context: map[string]interface{}{
						"campaign_type": "domain_generation",
					},
				},
			})
		return
	}
	respondWithJSONGin(c, http.StatusCreated, campaign)
}

func (h *CampaignOrchestratorAPIHandler) createDNSValidationCampaign(c *gin.Context) {
	var req services.CreateDNSValidationCampaignRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid request payload: "+err.Error())
		return
	}
	// req.UserID = getMaybeUserIDFromContext(c).String

	// if validate != nil {
	// 	if err := validate.Struct(req); err != nil {
	// 		respondWithErrorGin(c, http.StatusBadRequest, "Validation failed: "+err.Error())
	// 		return
	// 	}
	// }

	campaign, err := h.orchestratorService.CreateDNSValidationCampaign(c.Request.Context(), req)
	if err != nil {
		log.Printf("Error creating DNS validation campaign: %v", err)
		respondWithErrorGin(c, http.StatusInternalServerError, fmt.Sprintf("Failed to create DNS validation campaign: %v", err))
		return
	}
	respondWithJSONGin(c, http.StatusCreated, campaign)
}

func (h *CampaignOrchestratorAPIHandler) createHTTPKeywordCampaign(c *gin.Context) {
	var req services.CreateHTTPKeywordCampaignRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid request payload: "+err.Error())
		return
	}
	// req.UserID = getMaybeUserIDFromContext(c).String

	// if validate != nil {
	// 	if err := validate.Struct(req); err != nil {
	// 		respondWithErrorGin(c, http.StatusBadRequest, "Validation failed: "+err.Error())
	// 		return
	// 	}
	// }

	campaign, err := h.orchestratorService.CreateHTTPKeywordCampaign(c.Request.Context(), req)
	if err != nil {
		log.Printf("Error creating HTTP/Keyword campaign: %v", err)
		respondWithErrorGin(c, http.StatusInternalServerError, fmt.Sprintf("Failed to create HTTP/Keyword campaign: %v", err))
		return
	}
	respondWithJSONGin(c, http.StatusCreated, campaign)
}

// --- Campaign Information Handlers ---

func (h *CampaignOrchestratorAPIHandler) listCampaigns(c *gin.Context) {
	// Parse and validate query parameters
	limit, err := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if err != nil || limit < 1 || limit > 100 {
		respondWithDetailedErrorGin(c, http.StatusBadRequest, ErrorCodeValidation,
			"Invalid limit parameter", []ErrorDetail{
				{
					Field:   "limit",
					Code:    ErrorCodeValidation,
					Message: "Limit must be between 1 and 100",
				},
			})
		return
	}

	offset, err := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if err != nil || offset < 0 {
		respondWithDetailedErrorGin(c, http.StatusBadRequest, ErrorCodeValidation,
			"Invalid offset parameter", []ErrorDetail{
				{
					Field:   "offset",
					Code:    ErrorCodeValidation,
					Message: "Offset must be non-negative",
				},
			})
		return
	}

	statusFilter := models.CampaignStatusEnum(c.Query("status"))
	typeFilter := models.CampaignTypeEnum(c.Query("type"))

	filter := store.ListCampaignsFilter{
		Limit:  limit,
		Offset: offset,
		Status: statusFilter,
		Type:   typeFilter,
	}

	campaigns, totalCount, err := h.orchestratorService.ListCampaigns(c.Request.Context(), filter)
	if err != nil {
		log.Printf("Error listing campaigns: %v", err)
		respondWithDetailedErrorGin(c, http.StatusInternalServerError, ErrorCodeDatabaseError,
			"Failed to retrieve campaigns", nil)
		return
	}

	// Use unified response with metadata for pagination
	c.Header("X-Total-Count", fmt.Sprintf("%d", totalCount))
	response := NewSuccessResponse(campaigns, getRequestID(c))
	response.WithMetadata(&Metadata{
		Page: &PageInfo{
			Current:  (offset / limit) + 1,
			Total:    int((totalCount + int64(limit) - 1) / int64(limit)),
			PageSize: limit,
			Count:    int(totalCount),
		},
	})
	c.JSON(http.StatusOK, response)
}

func (h *CampaignOrchestratorAPIHandler) getCampaignDetails(c *gin.Context) {
	campaignIDStr := c.Param("campaignId")
	campaignID, err := uuid.Parse(campaignIDStr)
	if err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid campaign ID format")
		return
	}

	baseCampaign, params, err := h.orchestratorService.GetCampaignDetails(c.Request.Context(), campaignID)
	if err != nil {
		// Assuming store.ErrNotFound is an error variable (e.g., from a store package)
		// It's better to use errors.Is(err, store.ErrNotFound) if store.ErrNotFound is a specific error type
		// For now, keeping the string comparison as it was, but this is a point of improvement.
		// if errors.Is(err, store.ErrNotFound) { // Example for future
		if err.Error() == "record not found" { // Or whatever store.ErrNotFound.Error() actually returns
			respondWithErrorGin(c, http.StatusNotFound, "Campaign not found")
		} else {
			log.Printf("Error getting campaign details for %s: %v", campaignIDStr, err)
			respondWithErrorGin(c, http.StatusInternalServerError, "Failed to get campaign details")
		}
		return
	}

	// Combine base campaign and specific params into a single response DTO
	type CampaignDetailsResponse struct { // Corrected 'ype' to 'type'
		*models.Campaign
		Params interface{} `json:"params"`
	}
	resp := CampaignDetailsResponse{
		Campaign: baseCampaign,
		Params:   params,
	}
	respondWithJSONGin(c, http.StatusOK, resp)
}

func (h *CampaignOrchestratorAPIHandler) getCampaignStatus(c *gin.Context) {
	campaignIDStr := c.Param("campaignId")
	campaignID, err := uuid.Parse(campaignIDStr)
	if err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid campaign ID format")
		return
	}

	status, progress, err := h.orchestratorService.GetCampaignStatus(c.Request.Context(), campaignID)
	if err != nil {
		// if errors.Is(err, store.ErrNotFound) { // Example for future
		if err.Error() == "record not found" { // Or whatever store.ErrNotFound.Error() actually returns
			respondWithErrorGin(c, http.StatusNotFound, "Campaign not found")
		} else {
			log.Printf("Error getting campaign status for %s: %v", campaignIDStr, err)
			respondWithErrorGin(c, http.StatusInternalServerError, "Failed to get campaign status")
		}
		return
	}
	respondWithJSONGin(c, http.StatusOK, gin.H{"status": status, "progressPercentage": progress})
}

// --- Campaign Control Handlers ---

func (h *CampaignOrchestratorAPIHandler) startCampaign(c *gin.Context) {
	campaignIDStr := c.Param("campaignId")
	campaignID, err := uuid.Parse(campaignIDStr)
	if err != nil {
		respondWithDetailedErrorGin(c, http.StatusBadRequest, ErrorCodeValidation,
			"Invalid campaign ID format", []ErrorDetail{
				{
					Field:   "campaignId",
					Code:    ErrorCodeValidation,
					Message: "Campaign ID must be a valid UUID",
				},
			})
		return
	}

	if err := h.orchestratorService.StartCampaign(c.Request.Context(), campaignID); err != nil {
		log.Printf("Error starting campaign %s: %v", campaignIDStr, err)

		// Differentiate error types based on error message
		// In production, use proper error types from the service layer
		if err.Error() == "record not found" {
			respondWithDetailedErrorGin(c, http.StatusNotFound, ErrorCodeNotFound,
				"Campaign not found", nil)
		} else if err.Error() == "campaign already running" || err.Error() == "invalid campaign state" {
			respondWithDetailedErrorGin(c, http.StatusConflict, ErrorCodeInvalidState,
				"Campaign is in an invalid state for this operation", []ErrorDetail{
					{
						Code:    ErrorCodeInvalidState,
						Message: err.Error(),
						Context: map[string]interface{}{
							"campaign_id": campaignID,
						},
					},
				})
		} else {
			respondWithDetailedErrorGin(c, http.StatusInternalServerError, ErrorCodeInternalServer,
				"Failed to start campaign", nil)
		}
		return
	}

	respondWithJSONGin(c, http.StatusOK, map[string]interface{}{
		"message":     "Campaign queued for start",
		"campaign_id": campaignID,
	})
}

func (h *CampaignOrchestratorAPIHandler) pauseCampaign(c *gin.Context) {
	campaignIDStr := c.Param("campaignId")
	campaignID, err := uuid.Parse(campaignIDStr)
	if err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid campaign ID format")
		return
	}

	if err := h.orchestratorService.PauseCampaign(c.Request.Context(), campaignID); err != nil {
		log.Printf("Error pausing campaign %s: %v", campaignIDStr, err)
		respondWithErrorGin(c, http.StatusInternalServerError, fmt.Sprintf("Failed to pause campaign: %v", err))
		return
	}
	respondWithJSONGin(c, http.StatusOK, gin.H{"message": "Campaign pause requested"})
}

func (h *CampaignOrchestratorAPIHandler) resumeCampaign(c *gin.Context) {
	campaignIDStr := c.Param("campaignId")
	campaignID, err := uuid.Parse(campaignIDStr)
	if err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid campaign ID format")
		return
	}

	if err := h.orchestratorService.ResumeCampaign(c.Request.Context(), campaignID); err != nil {
		log.Printf("Error resuming campaign %s: %v", campaignIDStr, err)
		respondWithErrorGin(c, http.StatusInternalServerError, fmt.Sprintf("Failed to resume campaign: %v", err))
		return
	}
	respondWithJSONGin(c, http.StatusOK, gin.H{"message": "Campaign queued for resume"})
}

func (h *CampaignOrchestratorAPIHandler) cancelCampaign(c *gin.Context) {
	campaignIDStr := c.Param("campaignId")
	campaignID, err := uuid.Parse(campaignIDStr)
	if err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid campaign ID format")
		return
	}

	if err := h.orchestratorService.CancelCampaign(c.Request.Context(), campaignID); err != nil {
		log.Printf("Error cancelling campaign %s: %v", campaignIDStr, err)
		respondWithErrorGin(c, http.StatusInternalServerError, fmt.Sprintf("Failed to cancel campaign: %v", err))
		return
	}
	respondWithJSONGin(c, http.StatusOK, gin.H{"message": "Campaign cancellation requested"})
}

func (h *CampaignOrchestratorAPIHandler) updateCampaign(c *gin.Context) {
	campaignIDStr := c.Param("campaignId")
	campaignID, err := uuid.Parse(campaignIDStr)
	if err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid campaign ID format")
		return
	}

	var req services.UpdateCampaignRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid request payload: "+err.Error())
		return
	}

	campaign, err := h.orchestratorService.UpdateCampaign(c.Request.Context(), campaignID, req)
	if err != nil {
		log.Printf("Error updating campaign %s: %v", campaignIDStr, err)
		respondWithErrorGin(c, http.StatusInternalServerError, fmt.Sprintf("Failed to update campaign: %v", err))
		return
	}
	respondWithJSONGin(c, http.StatusOK, campaign)
}

func (h *CampaignOrchestratorAPIHandler) deleteCampaign(c *gin.Context) {
	campaignIDStr := c.Param("campaignId")
	campaignID, err := uuid.Parse(campaignIDStr)
	if err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid campaign ID format")
		return
	}

	if err := h.orchestratorService.DeleteCampaign(c.Request.Context(), campaignID); err != nil {
		log.Printf("Error deleting campaign %s: %v", campaignIDStr, err)
		respondWithErrorGin(c, http.StatusInternalServerError, fmt.Sprintf("Failed to delete campaign: %v", err))
		return
	}
	respondWithJSONGin(c, http.StatusOK, gin.H{"message": "Campaign deleted successfully"})
}

func (h *CampaignOrchestratorAPIHandler) getGeneratedDomains(c *gin.Context) {
	campaignIDStr := c.Param("campaignId")
	campaignID, err := uuid.Parse(campaignIDStr)
	if err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid campaign ID format")
		return
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	cursor, _ := strconv.ParseInt(c.DefaultQuery("cursor", "0"), 10, 64)

	resp, err := h.orchestratorService.GetGeneratedDomainsForCampaign(c.Request.Context(), campaignID, limit, cursor)
	if err != nil {
		log.Printf("Error getting generated domains for campaign %s: %v", campaignIDStr, err)
		respondWithErrorGin(c, http.StatusInternalServerError, fmt.Sprintf("Failed to get generated domains: %v", err))
		return
	}
	respondWithJSONGin(c, http.StatusOK, resp)
}

func (h *CampaignOrchestratorAPIHandler) getDNSValidationResults(c *gin.Context) {
	campaignIDStr := c.Param("campaignId")
	campaignID, err := uuid.Parse(campaignIDStr)
	if err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid campaign ID format")
		return
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	cursor := c.DefaultQuery("cursor", "")
	validationStatus := c.Query("validationStatus")

	filter := store.ListValidationResultsFilter{
		ValidationStatus: validationStatus,
	}

	resp, err := h.orchestratorService.GetDNSValidationResultsForCampaign(c.Request.Context(), campaignID, limit, cursor, filter)
	if err != nil {
		log.Printf("Error getting DNS validation results for campaign %s: %v", campaignIDStr, err)
		respondWithErrorGin(c, http.StatusInternalServerError, fmt.Sprintf("Failed to get DNS validation results: %v", err))
		return
	}
	respondWithJSONGin(c, http.StatusOK, resp)
}

func (h *CampaignOrchestratorAPIHandler) getHTTPKeywordResults(c *gin.Context) {
	campaignIDStr := c.Param("campaignId")
	campaignID, err := uuid.Parse(campaignIDStr)
	if err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid campaign ID format")
		return
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	cursor := c.DefaultQuery("cursor", "")
	validationStatus := c.Query("validationStatus")
	hasKeywordsStr := c.Query("hasKeywords")
	var hasKeywords *bool
	if hasKeywordsStr != "" {
		b, err := strconv.ParseBool(hasKeywordsStr)
		if err == nil {
			hasKeywords = &b
		}
	}

	filter := store.ListValidationResultsFilter{
		ValidationStatus: validationStatus,
		HasKeywords:      hasKeywords,
	}

	resp, err := h.orchestratorService.GetHTTPKeywordResultsForCampaign(c.Request.Context(), campaignID, limit, cursor, filter)
	if err != nil {
		log.Printf("Error getting HTTP keyword results for campaign %s: %v", campaignIDStr, err)
		respondWithErrorGin(c, http.StatusInternalServerError, fmt.Sprintf("Failed to get HTTP keyword results: %v", err))
		return
	}
	respondWithJSONGin(c, http.StatusOK, resp)
}

// Helper functions (assuming they exist elsewhere or should be defined)
// These are not defined in the provided snippet, so they would cause compilation errors if not present.
// For the purpose of fixing the syntax error, their definitions are not strictly needed, but
// a complete, compilable file would require them.

// var validate *validator.Validate // Example: Assuming global validator

// func respondWithErrorGin(c *gin.Context, code int, message string) {
// 	c.JSON(code, gin.H{"error": message})
// }

// func respondWithJSONGin(c *gin.Context, code int, payload interface{}) {
// 	c.JSON(code, payload)
// }

// func getMaybeUserIDFromContext(c *gin.Context) uuid.UUID {
// 	// Placeholder: Implement user ID retrieval from context
// 	// userID, exists := c.Get("userID")
// 	// if exists {
// 	// 	if id, ok := userID.(string); ok {
// 	// 		parsedID, _ := uuid.Parse(id)
// 	// 		return parsedID
// 	// 	}
// 	// 	if id, ok := userID.(uuid.UUID); ok {
// 	// 		return id
// 	// 	}
// 	// }
// 	return uuid.Nil
// }

// Placeholder for store.ErrNotFound if it's a package variable.
// This depends on how `store.ErrNotFound` is actually defined and used.
// If it's part of a specific package, that package needs to be imported.
// For example:
// import "errors" // if it's a generic error
// var ErrNotFound = errors.New("record not found") // A possible definition

// If store.ErrNotFound is from a package like:
// "github.com/fntelecomllc/studio/backend/internal/store"
// then that import should be present, and store.ErrNotFound would be used directly.
// The error message "expected ';', found CampaignDetailsResponse" did not relate to this,
// but for completeness, the string comparison `err.Error() == store.ErrNotFound.Error()`
// implies `store.ErrNotFound` is an error variable. I've changed the comparison to
// `err.Error() == "record not found"` as a placeholder, as `store.ErrNotFound` is not defined
// in the snippet. Ideally, you'd use `errors.Is(err, store.ErrNotFound)`.
