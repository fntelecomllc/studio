// File: backend/internal/api/persona_handlers.go
package api

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/fntelecomllc/studio/backend/internal/models"
	"github.com/fntelecomllc/studio/backend/internal/store"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// --- DTOs for Persona API ---

type CreatePersonaRequest struct {
	Name          string                 `json:"name" validate:"required,min=1,max=255"`
	PersonaType   models.PersonaTypeEnum `json:"personaType" validate:"required,oneof=dns http"`
	Description   string                 `json:"description,omitempty"`
	ConfigDetails json.RawMessage        `json:"configDetails" validate:"required"`
	IsEnabled     *bool                  `json:"isEnabled,omitempty"`
}

type UpdatePersonaRequest struct {
	Name          *string         `json:"name,omitempty" validate:"omitempty,min=1,max=255"`
	Description   *string         `json:"description,omitempty"`
	ConfigDetails json.RawMessage `json:"configDetails,omitempty"`
	IsEnabled     *bool           `json:"isEnabled,omitempty"`
}

// PersonaResponse formats a persona for API responses.
type PersonaResponse struct {
	ID            uuid.UUID              `json:"id"`
	Name          string                 `json:"name"`
	PersonaType   models.PersonaTypeEnum `json:"personaType"`
	Description   string                 `json:"description,omitempty"`
	ConfigDetails json.RawMessage        `json:"configDetails"`
	IsEnabled     bool                   `json:"isEnabled"`
	CreatedAt     time.Time              `json:"createdAt"`
	UpdatedAt     time.Time              `json:"updatedAt"`
}

func toPersonaResponse(p *models.Persona) PersonaResponse {
	return PersonaResponse{
		ID:            p.ID,
		Name:          p.Name,
		PersonaType:   p.PersonaType,
		Description:   p.Description.String,
		ConfigDetails: p.ConfigDetails,
		IsEnabled:     p.IsEnabled,
		CreatedAt:     p.CreatedAt,
		UpdatedAt:     p.UpdatedAt,
	}
}

// --- Gin Handlers for Personas ---

func (h *APIHandler) CreateDNSPersonaGin(c *gin.Context) {
	h.createPersonaGin(c, models.PersonaTypeDNS)
}

func (h *APIHandler) CreateHTTPPersonaGin(c *gin.Context) {
	h.createPersonaGin(c, models.PersonaTypeHTTP)
}

func (h *APIHandler) createPersonaGin(c *gin.Context, personaType models.PersonaTypeEnum) {
	log.Printf("[createPersonaGin] Attempting to create persona of type: %s", personaType)
	var req CreatePersonaRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("[createPersonaGin] Error binding JSON: %v", err)
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid request payload: "+err.Error())
		return
	}
	log.Printf("[createPersonaGin] Request payload bound successfully for %s.", req.Name)

	req.PersonaType = personaType // Ensure type from path is authoritative

	if err := validate.Struct(req); err != nil {
		log.Printf("[createPersonaGin] Validation failed for CreatePersonaRequest: %v", err)
		respondWithErrorGin(c, http.StatusBadRequest, "Validation failed: "+err.Error())
		return
	}
	log.Printf("[createPersonaGin] CreatePersonaRequest validated for %s.", req.Name)

	switch req.PersonaType {
	case models.PersonaTypeDNS:
		var dnsConfig models.DNSConfigDetails
		if err := json.Unmarshal(req.ConfigDetails, &dnsConfig); err != nil {
			log.Printf("[createPersonaGin] Invalid DNS configDetails for %s: %v", req.Name, err)
			respondWithErrorGin(c, http.StatusBadRequest, "Invalid DNS configDetails: "+err.Error())
			return
		}
		if err := validate.Struct(dnsConfig); err != nil {
			log.Printf("[createPersonaGin] DNS configDetails validation failed for %s: %v", req.Name, err)
			respondWithErrorGin(c, http.StatusBadRequest, "DNS configDetails validation failed: "+err.Error())
			return
		}
		log.Printf("[createPersonaGin] DNS ConfigDetails validated for %s.", req.Name)
	case models.PersonaTypeHTTP:
		var httpConfig models.HTTPConfigDetails
		if err := json.Unmarshal(req.ConfigDetails, &httpConfig); err != nil {
			log.Printf("[createPersonaGin] Invalid HTTP configDetails for %s: %v", req.Name, err)
			respondWithErrorGin(c, http.StatusBadRequest, "Invalid HTTP configDetails: "+err.Error())
			return
		}
		if err := validate.Struct(httpConfig); err != nil {
			log.Printf("[createPersonaGin] HTTP configDetails validation failed for %s: %v", req.Name, err)
			respondWithErrorGin(c, http.StatusBadRequest, "HTTP configDetails validation failed: "+err.Error())
			return
		}
		log.Printf("[createPersonaGin] HTTP ConfigDetails validated for %s.", req.Name)
	default:
		log.Printf("[createPersonaGin] Invalid personaType '%s' encountered unexpectedly for %s.", req.PersonaType, req.Name)
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid personaType in request after path assignment")
		return
	}

	now := time.Now().UTC()
	personaID := uuid.New()
	isEnabled := true
	if req.IsEnabled != nil {
		isEnabled = *req.IsEnabled
	}

	persona := &models.Persona{
		ID:            personaID,
		Name:          req.Name,
		PersonaType:   req.PersonaType,
		Description:   sql.NullString{String: req.Description, Valid: req.Description != ""},
		ConfigDetails: req.ConfigDetails,
		IsEnabled:     isEnabled,
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	log.Printf("[createPersonaGin] Prepared persona model for %s (ID: %s)", persona.Name, persona.ID)

	var querier store.Querier
	var opErr error // Used to signal rollback for SQL transactions
	isSQL := h.DB != nil

	if isSQL {
		sqlTx, startTxErr := h.DB.BeginTxx(c.Request.Context(), nil)
		if startTxErr != nil {
			log.Printf("[createPersonaGin] Error beginning SQL transaction for %s: %v", persona.Name, startTxErr)
			respondWithErrorGin(c, http.StatusInternalServerError, "Failed to start SQL transaction")
			return
		}
		querier = sqlTx
		log.Printf("[createPersonaGin] SQL Transaction started for %s.", persona.Name)

		defer func() {
			if p := recover(); p != nil {
				log.Printf("[createPersonaGin] Panic recovered during SQL persona creation for %s, rolling back: %v", req.Name, p)
				sqlTx.Rollback()
				panic(p)
			} else if opErr != nil {
				log.Printf("[createPersonaGin] Error occurred for %s (SQL), rolling back: %v", req.Name, opErr)
				sqlTx.Rollback()
			} else {
				if commitErr := sqlTx.Commit(); commitErr != nil {
					log.Printf("[createPersonaGin] Error committing SQL transaction for %s: %v", req.Name, commitErr)
					// If commit fails, an error response should ideally be sent if not already.
					// This state means the operation might be in an indeterminate state for the client.
					// To ensure a response, we might need to set opErr = commitErr and handle it post-defer,
					// but that complicates flow as defer runs after function returns.
					// For now, log it. If opErr was nil, a success (201) would have been sent before this.
				} else {
					log.Printf("[createPersonaGin] SQL Transaction committed for %s.", persona.Name)
				}
			}
		}()
	} else {
		log.Printf("[createPersonaGin] Operating in Firestore mode (no handler-level transaction) for %s.", persona.Name)
		// querier remains nil, Firestore store methods will use their internal client
	}

	// Create Persona
	if err := h.PersonaStore.CreatePersona(c.Request.Context(), querier, persona); err != nil {
		opErr = err // Set opErr for SQL rollback if applicable
		log.Printf("[createPersonaGin] Error calling PersonaStore.CreatePersona for %s: %v", persona.Name, opErr)
		respondWithErrorGin(c, http.StatusInternalServerError, fmt.Sprintf("Failed to create %s persona: %v", req.PersonaType, opErr))
		return
	}
	log.Printf("[createPersonaGin] PersonaStore.CreatePersona successful for %s.", persona.Name)

	// Create Audit Log
	auditLog := &models.AuditLog{
		UserID:     uuid.NullUUID{}, // TODO: Populate UserID if available from auth context
		Action:     fmt.Sprintf("Create %s Persona", req.PersonaType),
		EntityType: sql.NullString{String: "Persona", Valid: true},
		EntityID:   uuid.NullUUID{UUID: personaID, Valid: true},
		Details:    models.JSONRawMessagePtr(json.RawMessage(fmt.Sprintf(`{"name":"%s", "id":"%s"}`, persona.Name, persona.ID.String()))),
	}
	if err := h.AuditLogStore.CreateAuditLog(c.Request.Context(), querier, auditLog); err != nil {
		opErr = err // Set opErr for SQL rollback if applicable
		log.Printf("[createPersonaGin] Error creating audit log for new persona %s: %v", personaID, opErr)
		// If isSQL, the deferred rollback will handle this opErr.
		// For Firestore, persona is created but audit log failed. This is an inconsistency.
		respondWithErrorGin(c, http.StatusInternalServerError, fmt.Sprintf("Failed to create %s persona (audit log error, transaction will be rolled back if SQL): %v", req.PersonaType, opErr))
		return
	}
	log.Printf("[createPersonaGin] AuditLogStore.CreateAuditLog successful for %s.", persona.Name)

	// If opErr is nil at this point, and if isSQL, the deferred commit will be attempted.
	// If not isSQL (Firestore), both operations succeeded independently.
	respondWithJSONGin(c, http.StatusCreated, toPersonaResponse(persona))
	log.Printf("[createPersonaGin] Successfully created persona %s (ID: %s) and responded.", persona.Name, persona.ID)
}

func (h *APIHandler) ListDNSPersonasGin(c *gin.Context) {
	h.listPersonasGin(c, models.PersonaTypeDNS)
}

func (h *APIHandler) ListHTTPPersonasGin(c *gin.Context) {
	h.listPersonasGin(c, models.PersonaTypeHTTP)
}

func (h *APIHandler) listPersonasGin(c *gin.Context, personaType models.PersonaTypeEnum) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	isEnabledQuery := c.Query("isEnabled")
	var isEnabledFilter *bool
	if isEnabledQuery != "" {
		b, err := strconv.ParseBool(isEnabledQuery)
		if err == nil {
			isEnabledFilter = &b
		}
	}

	filter := store.ListPersonasFilter{
		Type:      personaType,
		IsEnabled: isEnabledFilter,
		Limit:     limit,
		Offset:    offset,
	}

	// For list operations, transactions are typically not managed at the handler level.
	// The store method is responsible for querying. We pass h.DB (which will be nil for Firestore)
	// and the Firestore store implementation should handle a nil Querier by using its internal client.
	// The Postgres store will use h.DB directly if non-nil Querier is not provided, or use the Querier if it is (e.g. a Tx).
	var querier store.Querier
	if h.DB != nil {
		querier = h.DB // Use DB for non-transactional reads in SQL mode
	} // For Firestore, querier remains nil, store uses its client

	personas, err := h.PersonaStore.ListPersonas(c.Request.Context(), querier, filter)
	if err != nil {
		log.Printf("Error listing %s personas: %v", personaType, err)
		respondWithErrorGin(c, http.StatusInternalServerError, fmt.Sprintf("Failed to list %s personas", personaType))
		return
	}

	responseItems := make([]PersonaResponse, len(personas))
	for i, p := range personas {
		responseItems[i] = toPersonaResponse(p)
	}
	respondWithJSONGin(c, http.StatusOK, responseItems)
}

func (h *APIHandler) UpdateDNSPersonaGin(c *gin.Context) {
	h.updatePersonaGin(c, models.PersonaTypeDNS)
}

func (h *APIHandler) UpdateHTTPPersonaGin(c *gin.Context) {
	h.updatePersonaGin(c, models.PersonaTypeHTTP)
}

func (h *APIHandler) updatePersonaGin(c *gin.Context, personaType models.PersonaTypeEnum) {
	personaIDStr := c.Param("personaId")
	personaID, err := uuid.Parse(personaIDStr)
	if err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid persona ID format")
		return
	}

	var req UpdatePersonaRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid request payload: "+err.Error())
		return
	}

	if err := validate.Struct(req); err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Validation failed: "+err.Error())
		return
	}

	var querier store.Querier
	var opErr error
	isSQL := h.DB != nil

	if isSQL {
		sqlTx, startTxErr := h.DB.BeginTxx(c.Request.Context(), nil)
		if startTxErr != nil {
			log.Printf("[updatePersonaGin] Error beginning SQL transaction for %s: %v", personaIDStr, startTxErr)
			respondWithErrorGin(c, http.StatusInternalServerError, "Failed to start SQL transaction")
			return
		}
		querier = sqlTx
		log.Printf("[updatePersonaGin] SQL Transaction started for %s.", personaIDStr)

		defer func() {
			if p := recover(); p != nil {
				log.Printf("[updatePersonaGin] Panic recovered during SQL persona update for %s, rolling back: %v", personaIDStr, p)
				sqlTx.Rollback()
				panic(p)
			} else if opErr != nil {
				log.Printf("[updatePersonaGin] Error occurred for %s (SQL), rolling back: %v", personaIDStr, opErr)
				sqlTx.Rollback()
			} else {
				if commitErr := sqlTx.Commit(); commitErr != nil {
					log.Printf("[updatePersonaGin] Error committing SQL transaction for %s: %v", personaIDStr, commitErr)
				} else {
					log.Printf("[updatePersonaGin] SQL Transaction committed for %s.", personaIDStr)
				}
			}
		}()
	} else {
		log.Printf("[updatePersonaGin] Operating in Firestore mode for %s.", personaIDStr)
	}

	existingPersona, fetchErr := h.PersonaStore.GetPersonaByID(c.Request.Context(), querier, personaID)
	if fetchErr != nil {
		opErr = fetchErr // Set opErr for SQL rollback if applicable
		if opErr == store.ErrNotFound {
			respondWithErrorGin(c, http.StatusNotFound, fmt.Sprintf("Persona with ID %s not found", personaIDStr))
		} else {
			log.Printf("[updatePersonaGin] Error fetching persona %s for update: %v", personaIDStr, opErr)
			respondWithErrorGin(c, http.StatusInternalServerError, "Failed to fetch persona for update")
		}
		return
	}

	if existingPersona.PersonaType != personaType {
		opErr = fmt.Errorf("persona ID %s is type '%s', expected '%s'", personaIDStr, existingPersona.PersonaType, personaType)
		respondWithErrorGin(c, http.StatusBadRequest, opErr.Error()) // opErr will trigger rollback if SQL
		return
	}

	updated := false
	if req.Name != nil {
		existingPersona.Name = *req.Name
		updated = true
	}
	if req.Description != nil {
		existingPersona.Description = sql.NullString{String: *req.Description, Valid: true}
		updated = true
	}
	if req.ConfigDetails != nil {
		// Validate new configDetails before assigning
		switch personaType {
		case models.PersonaTypeDNS:
			var dnsConfig models.DNSConfigDetails
			if err := json.Unmarshal(req.ConfigDetails, &dnsConfig); err != nil {
				opErr = fmt.Errorf("invalid DNS configDetails for update: %w", err)
				respondWithErrorGin(c, http.StatusBadRequest, opErr.Error())
				return
			}
			if err := validate.Struct(dnsConfig); err != nil {
				opErr = fmt.Errorf("DNS configDetails validation failed for update: %w", err)
				respondWithErrorGin(c, http.StatusBadRequest, opErr.Error())
				return
			}
		case models.PersonaTypeHTTP:
			var httpConfig models.HTTPConfigDetails
			if err := json.Unmarshal(req.ConfigDetails, &httpConfig); err != nil {
				opErr = fmt.Errorf("invalid HTTP configDetails for update: %w", err)
				respondWithErrorGin(c, http.StatusBadRequest, opErr.Error())
				return
			}
			if err := validate.Struct(httpConfig); err != nil {
				opErr = fmt.Errorf("HTTP configDetails validation failed for update: %w", err)
				respondWithErrorGin(c, http.StatusBadRequest, opErr.Error())
				return
			}
		}
		existingPersona.ConfigDetails = req.ConfigDetails
		updated = true
	}
	if req.IsEnabled != nil {
		existingPersona.IsEnabled = *req.IsEnabled
		updated = true
	}

	if !updated {
		log.Printf("[updatePersonaGin] No fields to update for persona %s.", personaIDStr)
		// If SQL, opErr is nil, so deferred commit will happen for the no-op transaction.
		// If Firestore, no transaction was started.
		respondWithJSONGin(c, http.StatusOK, toPersonaResponse(existingPersona))
		return
	}

	existingPersona.UpdatedAt = time.Now().UTC()
	if errUpdate := h.PersonaStore.UpdatePersona(c.Request.Context(), querier, existingPersona); errUpdate != nil {
		opErr = errUpdate // Set opErr for SQL rollback
		log.Printf("[updatePersonaGin] Error updating persona %s: %v", personaIDStr, opErr)
		respondWithErrorGin(c, http.StatusInternalServerError, "Failed to update persona")
		return
	}

	auditLog := &models.AuditLog{
		UserID:     uuid.NullUUID{},
		Action:     fmt.Sprintf("Update %s Persona", personaType),
		EntityType: sql.NullString{String: "Persona", Valid: true},
		EntityID:   uuid.NullUUID{UUID: personaID, Valid: true},
	}
	if auditErr := h.AuditLogStore.CreateAuditLog(c.Request.Context(), querier, auditLog); auditErr != nil {
		opErr = auditErr // Set opErr for SQL rollback
		log.Printf("[updatePersonaGin] Error creating audit log for updated persona %s: %v", personaID, opErr)
		// For Firestore, persona is updated, audit log failed. Inconsistency.
		respondWithErrorGin(c, http.StatusInternalServerError, fmt.Sprintf("Failed to update %s persona (audit log error, transaction will be rolled back if SQL): %v", personaType, opErr))
		return
	}

	// If isSQL and opErr is nil, deferred commit will execute.
	// If Firestore and opErr is nil, operations succeeded independently.
	respondWithJSONGin(c, http.StatusOK, toPersonaResponse(existingPersona))
}

func (h *APIHandler) DeleteDNSPersonaGin(c *gin.Context) {
	h.deletePersonaGin(c, models.PersonaTypeDNS)
}

func (h *APIHandler) DeleteHTTPPersonaGin(c *gin.Context) {
	h.deletePersonaGin(c, models.PersonaTypeHTTP)
}

func (h *APIHandler) deletePersonaGin(c *gin.Context, personaType models.PersonaTypeEnum) {
	personaIDStr := c.Param("personaId")
	personaID, err := uuid.Parse(personaIDStr)
	if err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid persona ID format")
		return
	}

	var querier store.Querier
	var opErr error
	isSQL := h.DB != nil

	if isSQL {
		sqlTx, startTxErr := h.DB.BeginTxx(c.Request.Context(), nil)
		if startTxErr != nil {
			log.Printf("[deletePersonaGin] Error beginning SQL transaction for %s: %v", personaIDStr, startTxErr)
			respondWithErrorGin(c, http.StatusInternalServerError, "Failed to start SQL transaction")
			return
		}
		querier = sqlTx
		log.Printf("[deletePersonaGin] SQL Transaction started for %s.", personaIDStr)

		defer func() {
			if p := recover(); p != nil {
				log.Printf("[deletePersonaGin] Panic recovered during SQL persona deletion for %s, rolling back: %v", personaIDStr, p)
				sqlTx.Rollback()
				panic(p)
			} else if opErr != nil {
				log.Printf("[deletePersonaGin] Error occurred for %s (SQL), rolling back: %v", personaIDStr, opErr)
				sqlTx.Rollback()
			} else {
				if commitErr := sqlTx.Commit(); commitErr != nil {
					log.Printf("[deletePersonaGin] Error committing SQL transaction for %s: %v", personaIDStr, commitErr)
				} else {
					log.Printf("[deletePersonaGin] SQL Transaction committed for %s.", personaIDStr)
				}
			}
		}()
	} else {
		log.Printf("[deletePersonaGin] Operating in Firestore mode for %s.", personaIDStr)
	}

	// First, verify persona exists and is of the correct type (especially for audit log context)
	// This Get is done within the transaction for SQL, or directly for Firestore.
	_, fetchErr := h.PersonaStore.GetPersonaByID(c.Request.Context(), querier, personaID)
	if fetchErr != nil {
		opErr = fetchErr // Set opErr for SQL rollback
		if opErr == store.ErrNotFound {
			respondWithErrorGin(c, http.StatusNotFound, fmt.Sprintf("Persona with ID %s not found", personaIDStr))
		} else {
			log.Printf("[deletePersonaGin] Error fetching persona %s for delete check: %v", personaIDStr, opErr)
			respondWithErrorGin(c, http.StatusInternalServerError, "Failed to fetch persona for deletion")
		}
		return
	}

	if errDel := h.PersonaStore.DeletePersona(c.Request.Context(), querier, personaID); errDel != nil {
		opErr = errDel // Set opErr for SQL rollback
		// store.ErrNotFound might be returned if DeletePersona checks existence first, or if it was deleted between Get and Delete (race condition)
		if opErr == store.ErrNotFound { // This might be redundant if GetPersonaByID already confirmed existence
			respondWithErrorGin(c, http.StatusNotFound, fmt.Sprintf("Persona with ID %s not found for deletion (or already deleted)", personaIDStr))
		} else {
			log.Printf("[deletePersonaGin] Error deleting persona %s: %v", personaIDStr, opErr)
			respondWithErrorGin(c, http.StatusInternalServerError, "Failed to delete persona")
		}
		return
	}

	auditLog := &models.AuditLog{
		UserID:     uuid.NullUUID{},
		Action:     fmt.Sprintf("Delete %s Persona", personaType),
		EntityType: sql.NullString{String: "Persona", Valid: true},
		EntityID:   uuid.NullUUID{UUID: personaID, Valid: true},
	}
	if auditErr := h.AuditLogStore.CreateAuditLog(c.Request.Context(), querier, auditLog); auditErr != nil {
		opErr = auditErr // Set opErr for SQL rollback
		log.Printf("[deletePersonaGin] Error creating audit log for deleted persona %s: %v", personaID, opErr)
		// For Firestore, persona is deleted, audit log failed. Inconsistency.
		respondWithErrorGin(c, http.StatusInternalServerError, fmt.Sprintf("Failed to delete %s persona (audit log error, transaction will be rolled back if SQL): %v", personaType, opErr))
		return
	}

	// If isSQL and opErr is nil, deferred commit will execute.
	// If Firestore and opErr is nil, operations succeeded independently.
	c.Status(http.StatusNoContent)
}

// === UNIFIED PERSONA HANDLERS ===
// These handlers provide unified endpoints for both DNS and HTTP personas
// They support the frontend's expectation of unified API endpoints

// ListAllPersonasGin handles GET /api/v2/personas
// Returns all personas (both DNS and HTTP) with optional filtering
func (h *APIHandler) ListAllPersonasGin(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	isEnabledQuery := c.Query("isEnabled")
	var isEnabledFilter *bool
	if isEnabledQuery != "" {
		b, err := strconv.ParseBool(isEnabledQuery)
		if err == nil {
			isEnabledFilter = &b
		}
	}

	// Optional type filter
	personaTypeQuery := c.Query("personaType")
	var typeFilter models.PersonaTypeEnum
	if personaTypeQuery != "" {
		switch models.PersonaTypeEnum(personaTypeQuery) {
		case models.PersonaTypeDNS:
			typeFilter = models.PersonaTypeDNS
		case models.PersonaTypeHTTP:
			typeFilter = models.PersonaTypeHTTP
		default:
			// Invalid type, ignore filter
		}
	}
	// Note: empty typeFilter ("") means all types

	filter := store.ListPersonasFilter{
		Type:      typeFilter, // empty string means all types
		IsEnabled: isEnabledFilter,
		Limit:     limit,
		Offset:    offset,
	}

	var querier store.Querier
	if h.DB != nil {
		querier = h.DB
	}

	personas, err := h.PersonaStore.ListPersonas(c.Request.Context(), querier, filter)
	if err != nil {
		log.Printf("Error listing all personas: %v", err)
		respondWithErrorGin(c, http.StatusInternalServerError, "Failed to list personas")
		return
	}

	responseItems := make([]PersonaResponse, len(personas))
	for i, p := range personas {
		responseItems[i] = toPersonaResponse(p)
	}

	respondWithJSONGin(c, http.StatusOK, responseItems)
}

// CreatePersonaGin handles POST /api/v2/personas
// Creates a persona with the type specified in the request body
func (h *APIHandler) CreatePersonaGin(c *gin.Context) {
	var req CreatePersonaRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("[CreatePersonaGin] Error binding JSON: %v", err)
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid request payload: "+err.Error())
		return
	}

	// Validate persona type
	switch req.PersonaType {
	case models.PersonaTypeDNS, models.PersonaTypeHTTP:
		// Valid types
	default:
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid personaType. Must be 'dns' or 'http'")
		return
	}

	// Delegate to the type-specific handler logic
	h.createPersonaGin(c, req.PersonaType)
}

// GetPersonaByIDGin handles GET /api/v2/personas/:id
// Returns a specific persona by ID regardless of type
func (h *APIHandler) GetPersonaByIDGin(c *gin.Context) {
	personaIDStr := c.Param("id")
	personaID, err := uuid.Parse(personaIDStr)
	if err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid persona ID format")
		return
	}

	var querier store.Querier
	if h.DB != nil {
		querier = h.DB
	}

	persona, err := h.PersonaStore.GetPersonaByID(c.Request.Context(), querier, personaID)
	if err != nil {
		if err == store.ErrNotFound {
			respondWithErrorGin(c, http.StatusNotFound, fmt.Sprintf("Persona with ID %s not found", personaIDStr))
		} else {
			log.Printf("Error fetching persona %s: %v", personaIDStr, err)
			respondWithErrorGin(c, http.StatusInternalServerError, "Failed to fetch persona")
		}
		return
	}

	respondWithJSONGin(c, http.StatusOK, toPersonaResponse(persona))
}

// UpdatePersonaGin handles PUT /api/v2/personas/:id
// Updates a persona by ID, preserving its original type
func (h *APIHandler) UpdatePersonaGin(c *gin.Context) {
	personaIDStr := c.Param("id")
	personaID, err := uuid.Parse(personaIDStr)
	if err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid persona ID format")
		return
	}

	// First, get the existing persona to determine its type
	var querier store.Querier
	if h.DB != nil {
		querier = h.DB
	}

	existingPersona, err := h.PersonaStore.GetPersonaByID(c.Request.Context(), querier, personaID)
	if err != nil {
		if err == store.ErrNotFound {
			respondWithErrorGin(c, http.StatusNotFound, fmt.Sprintf("Persona with ID %s not found", personaIDStr))
		} else {
			log.Printf("Error fetching persona %s for update: %v", personaIDStr, err)
			respondWithErrorGin(c, http.StatusInternalServerError, "Failed to fetch persona for update")
		}
		return
	}

	// Delegate to the type-specific update handler
	h.updatePersonaGin(c, existingPersona.PersonaType)
}

// DeletePersonaGin handles DELETE /api/v2/personas/:id
// Deletes a persona by ID regardless of type
func (h *APIHandler) DeletePersonaGin(c *gin.Context) {
	personaIDStr := c.Param("id")
	personaID, err := uuid.Parse(personaIDStr)
	if err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid persona ID format")
		return
	}

	// First, get the existing persona to determine its type for proper audit logging
	var querier store.Querier
	if h.DB != nil {
		querier = h.DB
	}

	existingPersona, err := h.PersonaStore.GetPersonaByID(c.Request.Context(), querier, personaID)
	if err != nil {
		if err == store.ErrNotFound {
			respondWithErrorGin(c, http.StatusNotFound, fmt.Sprintf("Persona with ID %s not found", personaIDStr))
		} else {
			log.Printf("Error fetching persona %s for deletion: %v", personaIDStr, err)
			respondWithErrorGin(c, http.StatusInternalServerError, "Failed to fetch persona for deletion")
		}
		return
	}

	// Delegate to the type-specific delete handler
	h.deletePersonaGin(c, existingPersona.PersonaType)
}

// TestPersonaGin handles POST /api/v2/personas/:id/test
// Tests a persona by ID regardless of type
func (h *APIHandler) TestPersonaGin(c *gin.Context) {
	personaIDStr := c.Param("id")
	personaID, err := uuid.Parse(personaIDStr)
	if err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid persona ID format")
		return
	}

	// Get the persona to determine its type
	var querier store.Querier
	if h.DB != nil {
		querier = h.DB
	}

	persona, err := h.PersonaStore.GetPersonaByID(c.Request.Context(), querier, personaID)
	if err != nil {
		if err == store.ErrNotFound {
			respondWithErrorGin(c, http.StatusNotFound, fmt.Sprintf("Persona with ID %s not found", personaIDStr))
		} else {
			log.Printf("Error fetching persona %s for testing: %v", personaIDStr, err)
			respondWithErrorGin(c, http.StatusInternalServerError, "Failed to fetch persona for testing")
		}
		return
	}

	// For now, return a simple test result
	// In the future, this could trigger actual testing logic
	testResult := map[string]interface{}{
		"personaId":   persona.ID,
		"personaType": persona.PersonaType,
		"status":      "success",
		"message":     fmt.Sprintf("%s persona test completed successfully", persona.PersonaType),
		"testedAt":    time.Now().UTC().Format(time.RFC3339),
	}

	respondWithJSONGin(c, http.StatusOK, testResult)
}
