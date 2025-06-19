// File: backend/internal/api/keyword_set_handlers.go
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
	"github.com/jmoiron/sqlx" // For sqlx.Tx type, as it might be returned by store's BeginTxx
)

// --- DTOs for KeywordSet API ---

type KeywordRuleRequest struct {
	Pattern         string                     `json:"pattern" validate:"required"`
	RuleType        models.KeywordRuleTypeEnum `json:"ruleType" validate:"required,oneof=string regex"`
	IsCaseSensitive bool                       `json:"isCaseSensitive"`
	Category        string                     `json:"category,omitempty"`
	ContextChars    int                        `json:"contextChars,omitempty" validate:"gte=0"`
}

type CreateKeywordSetRequest struct {
	Name        string               `json:"name" validate:"required,min=1,max=255"`
	Description string               `json:"description,omitempty"`
	IsEnabled   *bool                `json:"isEnabled,omitempty"`
	Rules       []KeywordRuleRequest `json:"rules,omitempty" validate:"omitempty,dive"`
}

type UpdateKeywordSetRequest struct {
	Name        *string              `json:"name,omitempty" validate:"omitempty,min=1,max=255"`
	Description *string              `json:"description,omitempty"`
	IsEnabled   *bool                `json:"isEnabled,omitempty"`
	Rules       []KeywordRuleRequest `json:"rules,omitempty" validate:"omitempty,dive"`
}

// KeywordSetResponse formats a KeywordSet with its rules for API responses
type KeywordSetResponse struct {
	ID          uuid.UUID            `json:"id"`
	Name        string               `json:"name"`
	Description string               `json:"description,omitempty"`
	IsEnabled   bool                 `json:"isEnabled"`
	CreatedAt   time.Time            `json:"createdAt"`
	UpdatedAt   time.Time            `json:"updatedAt"`
	Rules       []models.KeywordRule `json:"rules,omitempty"`
	RuleCount   int                  `json:"ruleCount"`
}

func toKeywordSetResponse(ks *models.KeywordSet, rules []models.KeywordRule) KeywordSetResponse {
	return KeywordSetResponse{
		ID:          ks.ID,
		Name:        ks.Name,
		Description: ks.Description.String,
		IsEnabled:   ks.IsEnabled,
		CreatedAt:   ks.CreatedAt,
		UpdatedAt:   ks.UpdatedAt,
		Rules:       rules,
		RuleCount:   len(rules),
	}
}

// --- Gin Handlers for KeywordSets ---

func (h *APIHandler) CreateKeywordSetGin(c *gin.Context) {
	var req CreateKeywordSetRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid request payload: "+err.Error())
		return
	}
	if err := validate.Struct(req); err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Validation failed: "+err.Error())
		return
	}

	now := time.Now().UTC()
	setID := uuid.New()
	isEnabled := true
	if req.IsEnabled != nil {
		isEnabled = *req.IsEnabled
	}

	keywordSet := &models.KeywordSet{
		ID:          setID,
		Name:        req.Name,
		Description: sql.NullString{String: req.Description, Valid: req.Description != ""},
		IsEnabled:   isEnabled,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	var opErr error // For errors within the operation
	var querier store.Querier
	var sqlTx *sqlx.Tx // Will be non-nil only if KeywordStore provides an SQL transaction

	// Attempt to begin a transaction via the store.
	// The store implementation (SQL or Firestore) determines the outcome.
	tx, errBegin := h.KeywordStore.BeginTxx(c.Request.Context(), nil)

	if errBegin != nil {
		// This typically means Firestore store said "transactions not applicable this way"
		// or a real SQL error occurred during BeginTxx.
		// For Firestore, we proceed with querier = nil.
		// If it was a genuine SQL BeginTxx failure, store methods called with nil querier might also fail,
		// or this should be treated as a fatal error immediately.
		// Based on firestoreKeywordStore.BeginTxx, it returns an error.
		log.Printf("Info/Error from KeywordStore.BeginTxx for CreateKeywordSet: %v. Assuming non-SQL transactional mode or error.", errBegin)
		querier = nil
		// If errBegin is a critical SQL error, we might want to return early:
		// if isCriticalSQLError(errBegin) { respondWithErrorGin(c, http.StatusInternalServerError, "Failed to start transaction"); return }
	} else if tx != nil { // Successfully started an SQL transaction via the store
		sqlTx = tx
		querier = sqlTx // Use the SQL transaction as the querier
		log.Printf("SQL Transaction started via KeywordStore for CreateKeywordSet %s.", req.Name)
		defer func() {
			if p := recover(); p != nil {
				log.Printf("Panic recovered during SQL CreateKeywordSet for %s, rolling back: %v", req.Name, p)
				_ = sqlTx.Rollback() // Rollback the SQL transaction
				panic(p)
			} else if opErr != nil {
				log.Printf("Error occurred for CreateKeywordSet %s (SQL), rolling back: %v", req.Name, opErr)
				_ = sqlTx.Rollback() // Rollback the SQL transaction
			} else {
				// opErr is nil, try to commit the SQL transaction
				if commitErr := sqlTx.Commit(); commitErr != nil {
					log.Printf("Error committing SQL transaction for CreateKeywordSet %s: %v", req.Name, commitErr)
					opErr = commitErr // Propagate commit error
				} else {
					log.Printf("SQL Transaction committed for CreateKeywordSet %s.", req.Name)
				}
			}
		}()
	} else {
		// tx is nil and errBegin is nil. This implies a store (like Firestore) where BeginTxx is a no-op
		// for starting an explicit SQL-style transaction, and operations will be atomic individually
		// or use Firestore's native transactions internally if the store methods are designed that way.
		log.Printf("Operating in non-explicit-SQL-transaction mode for CreateKeywordSet %s (e.g., Firestore).", req.Name)
		querier = nil // Explicitly nil, store methods must handle this.
	}

	// All subsequent store calls use the 'querier' (which is sqlTx or nil)
	if errCreate := h.KeywordStore.CreateKeywordSet(c.Request.Context(), querier, keywordSet); errCreate != nil {
		opErr = errCreate // Set opErr; if sqlTx is active, defer will rollback
		if errCreate == store.ErrDuplicateEntry {
			respondWithErrorGin(c, http.StatusConflict, fmt.Sprintf("KeywordSet with name '%s' already exists", req.Name))
			return
		}
		log.Printf("Error creating keyword set '%s': %v", req.Name, errCreate)
		respondWithErrorGin(c, http.StatusInternalServerError, "Failed to create keyword set")
		return
	}

	createdRulesModels := []models.KeywordRule{}
	if len(req.Rules) > 0 {
		modelRules := make([]*models.KeywordRule, len(req.Rules))
		for i, rReq := range req.Rules {
			modelRules[i] = &models.KeywordRule{
				ID:              uuid.New(),
				KeywordSetID:    setID,
				Pattern:         rReq.Pattern,
				RuleType:        rReq.RuleType,
				IsCaseSensitive: rReq.IsCaseSensitive,
				Category:        sql.NullString{String: rReq.Category, Valid: rReq.Category != ""},
				ContextChars:    rReq.ContextChars,
				CreatedAt:       now,
				UpdatedAt:       now,
			}
		}
		if errCreateRules := h.KeywordStore.CreateKeywordRules(c.Request.Context(), querier, modelRules); errCreateRules != nil {
			opErr = errCreateRules // Set opErr; if sqlTx is active, defer will rollback
			log.Printf("Error creating rules for keyword set '%s': %v", req.Name, errCreateRules)
			respondWithErrorGin(c, http.StatusInternalServerError, "Failed to create keyword rules")
			return
		}
		for _, mr := range modelRules {
			createdRulesModels = append(createdRulesModels, *mr)
		}
	}

	// If opErr is set from operations above, and we're in SQL mode, defer handles rollback.
	// If not SQL mode, or if opErr is from commit (SQL), handle it after audit.
	if opErr != nil && sqlTx == nil { // If non-SQL mode and an error occurred
		// Response already sent by the block that set opErr
		return
	}

	// Audit log: Pass nil as querier, AuditLogStore must handle it.
	// Only create audit log if AuditLogStore is not nil
	if h.AuditLogStore != nil {
		auditLog := &models.AuditLog{
			UserID:       uuid.NullUUID{},
			Action:     "Create KeywordSet",
			EntityType: sql.NullString{String: "KeywordSet", Valid: true},
			EntityID:   uuid.NullUUID{UUID: setID, Valid: true},
			Details:    models.JSONRawMessagePtr(json.RawMessage(fmt.Sprintf(`{"name":"%s", "rule_count":%d}`, keywordSet.Name, len(createdRulesModels)))),
		}
		if auditErr := h.AuditLogStore.CreateAuditLog(c.Request.Context(), nil, auditLog); auditErr != nil {
			log.Printf("Error creating audit log for new keyword set %s: %v", setID, auditErr)
		}
	} else {
		log.Printf("Warning: AuditLogStore is nil, skipping audit logging for new keyword set %s", setID)
	}

	// After potential commit (if SQL), opErr might be set by commit failure.
	if opErr != nil {
		respondWithErrorGin(c, http.StatusInternalServerError, "Failed to finalize keyword set creation: "+opErr.Error())
		return
	}

	respondWithJSONGin(c, http.StatusCreated, toKeywordSetResponse(keywordSet, createdRulesModels))
}

func (h *APIHandler) ListKeywordSetsGin(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	includeRulesQuery := c.DefaultQuery("includeRules", "false")
	includeRules, _ := strconv.ParseBool(includeRulesQuery)

	isEnabledQuery := c.Query("isEnabled")
	var isEnabledFilter *bool
	if isEnabledQuery != "" {
		b, pErr := strconv.ParseBool(isEnabledQuery)
		if pErr == nil {
			isEnabledFilter = &b
		}
	}

	filter := store.ListKeywordSetsFilter{
		IsEnabled: isEnabledFilter,
		Limit:     limit,
		Offset:    offset,
	}

	// For read operations, pass nil as querier.
	// The store implementation (SQL or Firestore) will use its internal DB/client.
	ksets, err := h.KeywordStore.ListKeywordSets(c.Request.Context(), nil, filter)
	if err != nil {
		log.Printf("Error listing keyword sets: %v", err)
		respondWithErrorGin(c, http.StatusInternalServerError, "Failed to list keyword sets")
		return
	}

	responseItems := make([]KeywordSetResponse, len(ksets))
	for i, ks := range ksets {
		var rules []models.KeywordRule
		if includeRules {
			rules, err = h.KeywordStore.GetKeywordRulesBySetID(c.Request.Context(), nil, ks.ID)
			if err != nil {
				log.Printf("Error fetching rules for keyword set %s: %v", ks.ID, err)
				// Continue, partial data might be acceptable
			}
		}
		responseItems[i] = toKeywordSetResponse(ks, rules)
	}
	respondWithJSONGin(c, http.StatusOK, responseItems)
}

func (h *APIHandler) GetKeywordSetGin(c *gin.Context) {
	setIDStr := c.Param("setId")
	setID, err := uuid.Parse(setIDStr)
	if err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid keyword set ID format")
		return
	}

	// For read operations, pass nil as querier.
	kset, err := h.KeywordStore.GetKeywordSetByID(c.Request.Context(), nil, setID)
	if err != nil {
		if err == store.ErrNotFound {
			respondWithErrorGin(c, http.StatusNotFound, fmt.Sprintf("KeywordSet with ID %s not found", setIDStr))
			return
		}
		log.Printf("Error fetching keyword set %s: %v", setIDStr, err)
		respondWithErrorGin(c, http.StatusInternalServerError, "Failed to fetch keyword set")
		return
	}

	rules, err := h.KeywordStore.GetKeywordRulesBySetID(c.Request.Context(), nil, kset.ID)
	if err != nil {
		log.Printf("Error fetching rules for keyword set %s: %v", kset.ID, err)
		// Continue, partial data might be acceptable
	}

	respondWithJSONGin(c, http.StatusOK, toKeywordSetResponse(kset, rules))
}

func (h *APIHandler) UpdateKeywordSetGin(c *gin.Context) {
	setIDStr := c.Param("setId")
	setID, errParam := uuid.Parse(setIDStr)
	if errParam != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid keyword set ID format")
		return
	}

	var req UpdateKeywordSetRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid request payload: "+err.Error())
		return
	}
	if err := validate.Struct(req); err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Validation failed: "+err.Error())
		return
	}

	var opErr error
	var querier store.Querier
	var sqlTx *sqlx.Tx

	tx, errBegin := h.KeywordStore.BeginTxx(c.Request.Context(), nil)
	if errBegin != nil {
		log.Printf("Info/Error from KeywordStore.BeginTxx for UpdateKeywordSet: %v. Assuming non-SQL transactional mode or error.", errBegin)
		querier = nil
	} else if tx != nil {
		sqlTx = tx
		querier = sqlTx
		log.Printf("SQL Transaction started via KeywordStore for UpdateKeywordSet %s.", setIDStr)
		defer func() {
			if p := recover(); p != nil {
				log.Printf("Panic recovered during SQL UpdateKeywordSet for %s, rolling back: %v", setIDStr, p)
				_ = sqlTx.Rollback()
				panic(p)
			} else if opErr != nil {
				log.Printf("Error occurred for UpdateKeywordSet %s (SQL), rolling back: %v", setIDStr, opErr)
				_ = sqlTx.Rollback()
			} else {
				if commitErr := sqlTx.Commit(); commitErr != nil {
					log.Printf("Error committing SQL transaction for UpdateKeywordSet %s: %v", setIDStr, commitErr)
					opErr = commitErr
				} else {
					log.Printf("SQL Transaction committed for UpdateKeywordSet %s.", setIDStr)
				}
			}
		}()
	} else {
		log.Printf("Operating in non-explicit-SQL-transaction mode for UpdateKeywordSet %s (e.g., Firestore).", setIDStr)
		querier = nil
	}

	existingSet, errGet := h.KeywordStore.GetKeywordSetByID(c.Request.Context(), querier, setID)
	if errGet != nil {
		opErr = errGet
		if errGet == store.ErrNotFound {
			respondWithErrorGin(c, http.StatusNotFound, fmt.Sprintf("KeywordSet ID %s not found", setIDStr))
			return
		}
		log.Printf("Error fetching keyword set %s for update: %v", setIDStr, errGet)
		respondWithErrorGin(c, http.StatusInternalServerError, "Error fetching keyword set for update")
		return
	}

	updated := false
	if req.Name != nil {
		existingSet.Name = *req.Name
		updated = true
	}
	if req.Description != nil {
		existingSet.Description = sql.NullString{String: *req.Description, Valid: true}
		updated = true
	}
	if req.IsEnabled != nil {
		existingSet.IsEnabled = *req.IsEnabled
		updated = true
	}

	var updatedRulesModels []models.KeywordRule
	if req.Rules != nil {
		if errDel := h.KeywordStore.DeleteKeywordRulesBySetID(c.Request.Context(), querier, setID); errDel != nil {
			opErr = errDel
			log.Printf("Error deleting existing rules for keyword set %s: %v", setID, errDel)
			respondWithErrorGin(c, http.StatusInternalServerError, "Failed to update keyword rules (delete step)")
			return
		}
		if len(req.Rules) > 0 {
			modelRules := make([]*models.KeywordRule, len(req.Rules))
			now := time.Now().UTC()
			for i, rReq := range req.Rules {
				modelRules[i] = &models.KeywordRule{
					ID:              uuid.New(),
					KeywordSetID:    setID,
					Pattern:         rReq.Pattern,
					RuleType:        rReq.RuleType,
					IsCaseSensitive: rReq.IsCaseSensitive,
					Category:        sql.NullString{String: rReq.Category, Valid: rReq.Category != ""},
					ContextChars:    rReq.ContextChars,
					CreatedAt:       now,
					UpdatedAt:       now,
				}
			}
			if errCreateRules := h.KeywordStore.CreateKeywordRules(c.Request.Context(), querier, modelRules); errCreateRules != nil {
				opErr = errCreateRules
				log.Printf("Error creating new rules for keyword set %s: %v", setID, errCreateRules)
				respondWithErrorGin(c, http.StatusInternalServerError, "Failed to update keyword rules (create step)")
				return
			}
			for _, mr := range modelRules {
				updatedRulesModels = append(updatedRulesModels, *mr)
			}
		}
		updated = true
	} else {
		var errFetchRules error
		updatedRulesModels, errFetchRules = h.KeywordStore.GetKeywordRulesBySetID(c.Request.Context(), querier, setID)
		if errFetchRules != nil && opErr == nil {
			opErr = errFetchRules
			log.Printf("Error fetching existing rules for keyword set %s during update (req.Rules was nil): %v", setID, errFetchRules)
		}
	}

	if updated { // Only update the set itself if attributes or rules were actually changed
		existingSet.UpdatedAt = time.Now().UTC()
		if errUpdate := h.KeywordStore.UpdateKeywordSet(c.Request.Context(), querier, existingSet); errUpdate != nil {
			opErr = errUpdate
			if errUpdate == store.ErrDuplicateEntry {
				respondWithErrorGin(c, http.StatusConflict, fmt.Sprintf("KeywordSet name '%s' may already exist", existingSet.Name))
				return
			}
			log.Printf("Error updating keyword set %s: %v", setID, errUpdate)
			respondWithErrorGin(c, http.StatusInternalServerError, "Failed to update keyword set attributes")
			return
		}
	}

	if opErr != nil && sqlTx == nil { // If non-SQL mode and an error occurred
		return
	}

	if updated {
		if h.AuditLogStore != nil {
			auditLog := &models.AuditLog{
				UserID:       uuid.NullUUID{},
				Action:     "Update KeywordSet",
				EntityType: sql.NullString{String: "KeywordSet", Valid: true},
				EntityID:   uuid.NullUUID{UUID: setID, Valid: true},
			}
			if auditErr := h.AuditLogStore.CreateAuditLog(c.Request.Context(), nil, auditLog); auditErr != nil {
				log.Printf("Error creating audit log for updated keyword set %s: %v", setID, auditErr)
			}
		} else {
			log.Printf("Warning: AuditLogStore is nil, skipping audit logging for updated keyword set %s", setID)
		}
	}

	if opErr != nil { // Check opErr again, could be set by commit
		respondWithErrorGin(c, http.StatusInternalServerError, "Failed to finalize keyword set update: "+opErr.Error())
		return
	}

	respondWithJSONGin(c, http.StatusOK, toKeywordSetResponse(existingSet, updatedRulesModels))
}

func (h *APIHandler) DeleteKeywordSetGin(c *gin.Context) {
	setIDStr := c.Param("setId")
	setID, errParam := uuid.Parse(setIDStr)
	if errParam != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid keyword set ID format")
		return
	}

	var opErr error
	var querier store.Querier
	var sqlTx *sqlx.Tx

	tx, errBegin := h.KeywordStore.BeginTxx(c.Request.Context(), nil)
	if errBegin != nil {
		log.Printf("Info/Error from KeywordStore.BeginTxx for DeleteKeywordSet: %v. Assuming non-SQL transactional mode or error.", errBegin)
		querier = nil
	} else if tx != nil {
		sqlTx = tx
		querier = sqlTx
		log.Printf("SQL Transaction started via KeywordStore for DeleteKeywordSet %s.", setIDStr)
		defer func() {
			if p := recover(); p != nil {
				log.Printf("Panic recovered during SQL DeleteKeywordSet for %s, rolling back: %v", setIDStr, p)
				_ = sqlTx.Rollback()
				panic(p)
			} else if opErr != nil {
				log.Printf("Error occurred for DeleteKeywordSet %s (SQL), rolling back: %v", setIDStr, opErr)
				_ = sqlTx.Rollback()
			} else {
				if commitErr := sqlTx.Commit(); commitErr != nil {
					log.Printf("Error committing SQL transaction for DeleteKeywordSet %s: %v", setIDStr, commitErr)
					opErr = commitErr
				} else {
					log.Printf("SQL Transaction committed for DeleteKeywordSet %s.", setIDStr)
				}
			}
		}()
	} else {
		log.Printf("Operating in non-explicit-SQL-transaction mode for DeleteKeywordSet %s (e.g., Firestore).", setIDStr)
		querier = nil
	}

	// DeleteKeywordRulesBySetID needs to handle nil querier for Firestore
	// For Firestore, this might involve fetching the set, clearing rules, and saving.
	if errDelRules := h.KeywordStore.DeleteKeywordRulesBySetID(c.Request.Context(), querier, setID); errDelRules != nil {
		opErr = errDelRules
		log.Printf("Error deleting rules for keyword set %s: %v", setID, errDelRules)
		respondWithErrorGin(c, http.StatusInternalServerError, "Failed to delete keyword rules")
		return
	}
	// DeleteKeywordSet also needs to handle nil querier for Firestore
	if errDelSet := h.KeywordStore.DeleteKeywordSet(c.Request.Context(), querier, setID); errDelSet != nil {
		opErr = errDelSet
		if errDelSet == store.ErrNotFound {
			respondWithErrorGin(c, http.StatusNotFound, fmt.Sprintf("KeywordSet with ID %s not found", setIDStr))
			return
		}
		log.Printf("Error deleting keyword set %s: %v", setIDStr, errDelSet)
		respondWithErrorGin(c, http.StatusInternalServerError, "Failed to delete keyword set")
		return
	}

	if opErr != nil && sqlTx == nil {
		return
	}

	if h.AuditLogStore != nil {
		auditLog := &models.AuditLog{
			UserID:       uuid.NullUUID{},
			Action:     "Delete KeywordSet",
			EntityType: sql.NullString{String: "KeywordSet", Valid: true},
			EntityID:   uuid.NullUUID{UUID: setID, Valid: true},
		}
		if auditErr := h.AuditLogStore.CreateAuditLog(c.Request.Context(), nil, auditLog); auditErr != nil {
			log.Printf("Error creating audit log for deleted keyword set %s: %v", setID, auditErr)
		}
	} else {
		log.Printf("Warning: AuditLogStore is nil, skipping audit logging for deleted keyword set %s", setID)
	}

	if opErr != nil { // Check opErr again, could be set by commit
		respondWithErrorGin(c, http.StatusInternalServerError, "Failed to finalize keyword set deletion: "+opErr.Error())
		return
	}

	c.Status(http.StatusNoContent)
}
