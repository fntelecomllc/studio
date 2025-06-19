// File: backend/internal/api/proxy_handlers.go
package api

import (
	"database/sql"
	"encoding/json" // Needed for audit log details
	"fmt"
	"log"
	"net/http"
	"sort"
	"strconv" // For parsing limit/offset
	"time"

	"github.com/fntelecomllc/studio/backend/internal/config" // For ProxyToProxyConfigEntry
	"github.com/fntelecomllc/studio/backend/internal/models"
	"github.com/fntelecomllc/studio/backend/internal/proxymanager"
	"github.com/fntelecomllc/studio/backend/internal/store"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx" // Import for sqlx.Tx
	"golang.org/x/crypto/bcrypt"
)

// --- DTOs for Proxy API ---

type CreateProxyRequest struct {
	Name        string                   `json:"name" validate:"required,min=1,max=255"`
	Description string                   `json:"description,omitempty"`
	Protocol    models.ProxyProtocolEnum `json:"protocol" validate:"required,oneof=http https socks5 socks4"`
	Address     string                   `json:"address" validate:"required,hostname_port"`
	Username    string                   `json:"username,omitempty"`
	Password    string                   `json:"password,omitempty"`
	CountryCode string                   `json:"countryCode,omitempty"`
	IsEnabled   *bool                    `json:"isEnabled,omitempty"`
}

type UpdateProxyRequest struct {
	Name        *string                   `json:"name,omitempty" validate:"omitempty,min=1,max=255"`
	Description *string                   `json:"description,omitempty"`
	Protocol    *models.ProxyProtocolEnum `json:"protocol,omitempty" validate:"omitempty,oneof=http https socks5 socks4"`
	Address     *string                   `json:"address,omitempty" validate:"omitempty,hostname_port"`
	Username    *string                   `json:"username,omitempty"`
	Password    *string                   `json:"password,omitempty"`
	CountryCode *string                   `json:"countryCode,omitempty"`
	IsEnabled   *bool                     `json:"isEnabled,omitempty"`
}

// Helper to convert models.Proxy to config.ProxyConfigEntry
func proxyToProxyConfigEntry(p *models.Proxy) config.ProxyConfigEntry {
	if p == nil {
		return config.ProxyConfigEntry{}
	}
	isEnabled := p.IsEnabled
	var protocolStr string
	if p.Protocol != nil {
		protocolStr = string(*p.Protocol)
	}
	return config.ProxyConfigEntry{
		ID:          p.ID.String(),
		Name:        p.Name,
		Description: p.Description.String,
		Protocol:    protocolStr,
		Address:     p.Address,
		Username:    p.Username.String,
		Password:    "", // PasswordHash is in models.Proxy, TestProxy needs plaintext if it were to use it
		UserEnabled: &isEnabled,
	}
}

// toProxyResponse simply returns the proxy model itself, as it's already suitable for JSON response.
func toProxyResponse(p *models.Proxy) *models.Proxy {
	return p
}

func toListProxyResponse(proxies []*models.Proxy) []*models.Proxy {
	// Return slice of pointers directly as models.Proxy is already JSON-marshalable
	return proxies
}

// --- Gin Handlers for Proxies ---

func (h *APIHandler) ListProxiesGin(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	protocolFilter := models.ProxyProtocolEnum(c.Query("protocol"))
	isEnabledQuery := c.Query("isEnabled")
	var isEnabledFilter *bool
	if isEnabledQuery != "" {
		b, err := strconv.ParseBool(isEnabledQuery)
		if err == nil {
			isEnabledFilter = &b
		}
	}
	isHealthyQuery := c.Query("isHealthy")
	var isHealthyFilter *bool
	if isHealthyQuery != "" {
		b, err := strconv.ParseBool(isHealthyQuery)
		if err == nil {
			isHealthyFilter = &b
		}
	}

	filter := store.ListProxiesFilter{
		Protocol:  protocolFilter,
		IsEnabled: isEnabledFilter,
		IsHealthy: isHealthyFilter,
		Limit:     limit,
		Offset:    offset,
	}

	var querier store.Querier
	if h.DB != nil {
		querier = h.DB // Use DB for non-transactional reads in SQL mode
	} // For Firestore, querier remains nil, store uses its client

	proxies, err := h.ProxyStore.ListProxies(c.Request.Context(), querier, filter)
	if err != nil {
		log.Printf("Error listing proxies: %v", err)
		respondWithErrorGin(c, http.StatusInternalServerError, "Failed to list proxies")
		return
	}

	sort.Slice(proxies, func(i, j int) bool {
		if proxies[i] == nil || proxies[j] == nil {
			return false
		}
		return proxies[i].Name < proxies[j].Name
	})
	respondWithJSONGin(c, http.StatusOK, toListProxyResponse(proxies))
}

func (h *APIHandler) AddProxyGin(c *gin.Context) {
	var req CreateProxyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid request payload: "+err.Error())
		return
	}

	if err := validate.Struct(req); err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Validation failed: "+err.Error())
		return
	}

	now := time.Now().UTC()
	proxyID := uuid.New()
	isEnabled := true
	if req.IsEnabled != nil {
		isEnabled = *req.IsEnabled
	}

	var passwordHash sql.NullString
	if req.Password != "" {
		hashedBytes, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			log.Printf("Error hashing proxy password: %v", err)
			respondWithErrorGin(c, http.StatusInternalServerError, "Failed to process proxy password")
			return
		}
		passwordHash = sql.NullString{String: string(hashedBytes), Valid: true}
	}

	proxy := &models.Proxy{
		ID:            proxyID,
		Name:          req.Name,
		Description:   sql.NullString{String: req.Description, Valid: req.Description != ""},
		Protocol:      models.ProxyProtocolEnumPtr(req.Protocol),
		Address:       req.Address,
		Username:      sql.NullString{String: req.Username, Valid: req.Username != ""},
		PasswordHash:  passwordHash,
		CountryCode:   sql.NullString{String: req.CountryCode, Valid: req.CountryCode != ""},
		IsEnabled:     isEnabled,
		IsHealthy:     true,
		LastCheckedAt: sql.NullTime{Time: now, Valid: true},
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	var querier store.Querier
	var opErr error
	isSQL := h.DB != nil
	var sqlTx *sqlx.Tx // Declare sqlTx to be used in defer

	if isSQL {
		var startTxErr error
		sqlTx, startTxErr = h.DB.BeginTxx(c.Request.Context(), nil)
		if startTxErr != nil {
			log.Printf("[AddProxyGin] Error beginning SQL transaction: %v", startTxErr)
			respondWithErrorGin(c, http.StatusInternalServerError, "Failed to start SQL transaction")
			return
		}
		querier = sqlTx
		log.Printf("[AddProxyGin] SQL Transaction started.")
		defer func() {
			if p := recover(); p != nil {
				log.Printf("[AddProxyGin] Panic recovered (SQL), rolling back: %v", p)
				sqlTx.Rollback()
				panic(p)
			} else if opErr != nil {
				log.Printf("[AddProxyGin] Error occurred (SQL), rolling back: %v", opErr)
				sqlTx.Rollback()
			} else {
				if commitErr := sqlTx.Commit(); commitErr != nil {
					log.Printf("[AddProxyGin] Error committing SQL transaction: %v", commitErr)
				} else {
					log.Printf("[AddProxyGin] SQL Transaction committed.")
				}
			}
		}()
	} else {
		log.Printf("[AddProxyGin] Operating in Firestore mode.")
	}

	if err := h.ProxyStore.CreateProxy(c.Request.Context(), querier, proxy); err != nil {
		opErr = err
		log.Printf("Error creating proxy: %v", err)
		respondWithErrorGin(c, http.StatusInternalServerError, "Failed to create proxy")
		return
	}

	auditLog := &models.AuditLog{
		UserID:     uuid.NullUUID{},
		Action:     "Create Proxy",
		EntityType: sql.NullString{String: "Proxy", Valid: true},
		EntityID:   uuid.NullUUID{UUID: proxyID, Valid: true},
		Details:    models.JSONRawMessagePtr(json.RawMessage(fmt.Sprintf(`{"name":"%s", "address":"%s"}`, proxy.Name, proxy.Address))),
	}
	if auditErr := h.AuditLogStore.CreateAuditLog(c.Request.Context(), querier, auditLog); auditErr != nil {
		opErr = auditErr
		log.Printf("Error creating audit log for new proxy %s: %v", proxyID, opErr)
		respondWithErrorGin(c, http.StatusInternalServerError, fmt.Sprintf("Failed to create proxy (audit log error, transaction will be rolled back if SQL): %v", opErr))
		return
	}

	respondWithJSONGin(c, http.StatusCreated, toProxyResponse(proxy))
}

func (h *APIHandler) UpdateProxyGin(c *gin.Context) {
	proxyIDStr := c.Param("proxyId")
	proxyID, err := uuid.Parse(proxyIDStr)
	if err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid proxy ID format")
		return
	}

	var req UpdateProxyRequest
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
	var sqlTx *sqlx.Tx

	if isSQL {
		var startTxErr error
		sqlTx, startTxErr = h.DB.BeginTxx(c.Request.Context(), nil)
		if startTxErr != nil {
			log.Printf("[UpdateProxyGin] Error beginning SQL transaction: %v", startTxErr)
			respondWithErrorGin(c, http.StatusInternalServerError, "Failed to start SQL transaction")
			return
		}
		querier = sqlTx
		log.Printf("[UpdateProxyGin] SQL Transaction started for %s.", proxyIDStr)
		defer func() {
			if p := recover(); p != nil {
				log.Printf("[UpdateProxyGin] Panic recovered (SQL), rolling back: %v", p)
				sqlTx.Rollback()
				panic(p)
			} else if opErr != nil {
				log.Printf("[UpdateProxyGin] Error occurred (SQL), rolling back: %v", opErr)
				sqlTx.Rollback()
			} else {
				if commitErr := sqlTx.Commit(); commitErr != nil {
					log.Printf("[UpdateProxyGin] Error committing SQL transaction: %v", commitErr)
				} else {
					log.Printf("[UpdateProxyGin] SQL Transaction committed for %s.", proxyIDStr)
				}
			}
		}()
	} else {
		log.Printf("[UpdateProxyGin] Operating in Firestore mode for %s.", proxyIDStr)
	}

	existingProxy, fetchErr := h.ProxyStore.GetProxyByID(c.Request.Context(), querier, proxyID)
	if fetchErr != nil {
		opErr = fetchErr
		if opErr == store.ErrNotFound {
			respondWithErrorGin(c, http.StatusNotFound, fmt.Sprintf("Proxy with ID %s not found", proxyIDStr))
		} else {
			log.Printf("Error fetching proxy %s for update: %v", proxyIDStr, opErr)
			respondWithErrorGin(c, http.StatusInternalServerError, "Failed to fetch proxy for update")
		}
		return
	}

	updated := false
	if req.Name != nil {
		existingProxy.Name = *req.Name
		updated = true
	}
	if req.Description != nil {
		existingProxy.Description = sql.NullString{String: *req.Description, Valid: true}
		updated = true
	}
	if req.Protocol != nil {
		existingProxy.Protocol = req.Protocol
		updated = true
	} // Assign pointer to pointer
	if req.Address != nil {
		existingProxy.Address = *req.Address
		updated = true
	}
	if req.Username != nil {
		existingProxy.Username = sql.NullString{String: *req.Username, Valid: true}
		updated = true
	}
	if req.Password != nil {
		if *req.Password == "" {
			existingProxy.PasswordHash = sql.NullString{}
		} else {
			hashedBytes, pErr := bcrypt.GenerateFromPassword([]byte(*req.Password), bcrypt.DefaultCost)
			if pErr != nil {
				opErr = fmt.Errorf("failed to process proxy password for update: %w", pErr)
				log.Printf("Error hashing proxy password for update: %v", opErr)
				respondWithErrorGin(c, http.StatusInternalServerError, opErr.Error())
				return
			}
			existingProxy.PasswordHash = sql.NullString{String: string(hashedBytes), Valid: true}
		}
		updated = true
	}
	if req.CountryCode != nil {
		existingProxy.CountryCode = sql.NullString{String: *req.CountryCode, Valid: true}
		updated = true
	}
	if req.IsEnabled != nil {
		existingProxy.IsEnabled = *req.IsEnabled
		updated = true
	}

	if !updated {
		log.Printf("[UpdateProxyGin] No fields to update for proxy %s.", proxyIDStr)
		// If isSQL and opErr is nil, the deferred func will commit the no-op transaction.
		respondWithJSONGin(c, http.StatusOK, toProxyResponse(existingProxy))
		return
	}

	existingProxy.UpdatedAt = time.Now().UTC()
	if errUpdate := h.ProxyStore.UpdateProxy(c.Request.Context(), querier, existingProxy); errUpdate != nil {
		opErr = errUpdate
		log.Printf("Error updating proxy %s: %v", proxyIDStr, opErr)
		respondWithErrorGin(c, http.StatusInternalServerError, "Failed to update proxy")
		return
	}

	auditLog := &models.AuditLog{
		UserID:     uuid.NullUUID{},
		Action:     "Update Proxy",
		EntityType: sql.NullString{String: "Proxy", Valid: true},
		EntityID:   uuid.NullUUID{UUID: proxyID, Valid: true},
	}
	if auditErr := h.AuditLogStore.CreateAuditLog(c.Request.Context(), querier, auditLog); auditErr != nil {
		opErr = auditErr
		log.Printf("Error creating audit log for updated proxy %s: %v", proxyID, opErr)
		respondWithErrorGin(c, http.StatusInternalServerError, fmt.Sprintf("Failed to update proxy (audit log error, transaction will be rolled back if SQL): %v", opErr))
		return
	}

	respondWithJSONGin(c, http.StatusOK, toProxyResponse(existingProxy))
}

func (h *APIHandler) DeleteProxyGin(c *gin.Context) {
	proxyIDStr := c.Param("proxyId")
	proxyID, err := uuid.Parse(proxyIDStr)
	if err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid proxy ID format")
		return
	}

	var querier store.Querier
	var opErr error
	isSQL := h.DB != nil
	var sqlTx *sqlx.Tx

	if isSQL {
		var startTxErr error
		sqlTx, startTxErr = h.DB.BeginTxx(c.Request.Context(), nil)
		if startTxErr != nil {
			log.Printf("[DeleteProxyGin] Error beginning SQL transaction: %v", startTxErr)
			respondWithErrorGin(c, http.StatusInternalServerError, "Failed to start SQL transaction")
			return
		}
		querier = sqlTx
		log.Printf("[DeleteProxyGin] SQL Transaction started for %s.", proxyIDStr)
		defer func() {
			if p := recover(); p != nil {
				log.Printf("[DeleteProxyGin] Panic recovered (SQL), rolling back: %v", p)
				sqlTx.Rollback()
				panic(p)
			} else if opErr != nil {
				log.Printf("[DeleteProxyGin] Error occurred (SQL), rolling back: %v", opErr)
				sqlTx.Rollback()
			} else {
				if commitErr := sqlTx.Commit(); commitErr != nil {
					log.Printf("[DeleteProxyGin] Error committing SQL transaction: %v", commitErr)
				} else {
					log.Printf("[DeleteProxyGin] SQL Transaction committed for %s.", proxyIDStr)
				}
			}
		}()
	} else {
		log.Printf("[DeleteProxyGin] Operating in Firestore mode for %s.", proxyIDStr)
	}

	_, fetchErr := h.ProxyStore.GetProxyByID(c.Request.Context(), querier, proxyID)
	if fetchErr != nil {
		opErr = fetchErr
		if opErr == store.ErrNotFound {
			respondWithErrorGin(c, http.StatusNotFound, fmt.Sprintf("Proxy with ID %s not found", proxyIDStr))
		} else {
			log.Printf("[DeleteProxyGin] Error fetching proxy %s for delete check: %v", proxyIDStr, opErr)
			respondWithErrorGin(c, http.StatusInternalServerError, "Failed to fetch proxy for deletion")
		}
		return
	}

	if errDel := h.ProxyStore.DeleteProxy(c.Request.Context(), querier, proxyID); errDel != nil {
		opErr = errDel
		if opErr == store.ErrNotFound {
			respondWithErrorGin(c, http.StatusNotFound, fmt.Sprintf("Proxy with ID %s not found for deletion", proxyIDStr))
		} else {
			log.Printf("Error deleting proxy %s: %v", proxyIDStr, opErr)
			respondWithErrorGin(c, http.StatusInternalServerError, "Failed to delete proxy")
		}
		return
	}

	auditLog := &models.AuditLog{
		UserID:     uuid.NullUUID{},
		Action:     "Delete Proxy",
		EntityType: sql.NullString{String: "Proxy", Valid: true},
		EntityID:   uuid.NullUUID{UUID: proxyID, Valid: true},
	}
	if auditErr := h.AuditLogStore.CreateAuditLog(c.Request.Context(), querier, auditLog); auditErr != nil {
		opErr = auditErr
		log.Printf("Error creating audit log for deleted proxy %s: %v", proxyID, opErr)
		respondWithErrorGin(c, http.StatusInternalServerError, fmt.Sprintf("Failed to delete proxy (audit log error, transaction will be rolled back if SQL): %v", opErr))
		return
	}

	c.Status(http.StatusNoContent)
}

func (h *APIHandler) GetProxyStatusesGin(c *gin.Context) {
	if h.ProxyMgr == nil {
		respondWithErrorGin(c, http.StatusInternalServerError, "ProxyManager not available")
		return
	}
	statuses := h.ProxyMgr.GetAllProxyStatuses()
	sort.Slice(statuses, func(i, j int) bool { return statuses[i].ID < statuses[j].ID })
	respondWithJSONGin(c, http.StatusOK, statuses)
}

func (h *APIHandler) ForceCheckSingleProxyGin(c *gin.Context) {
	if h.ProxyMgr == nil {
		respondWithErrorGin(c, http.StatusInternalServerError, "ProxyManager not available")
		return
	}
	proxyID := c.Param("proxyId")
	if proxyID == "" {
		respondWithErrorGin(c, http.StatusBadRequest, "Proxy ID missing in path")
		return
	}
	log.Printf("API: Gin request to force health check for proxy ID '%s'", proxyID)
	updatedStatus, err := h.ProxyMgr.ForceCheckSingleProxy(proxyID)
	if err != nil {
		if err.Error() == fmt.Sprintf("proxy ID '%s' not found", proxyID) {
			respondWithErrorGin(c, http.StatusNotFound, err.Error())
		} else {
			respondWithErrorGin(c, http.StatusInternalServerError, err.Error())
		}
		return
	}
	respondWithJSONGin(c, http.StatusOK, updatedStatus)
}

func (h *APIHandler) ForceCheckAllProxiesGin(c *gin.Context) {
	if h.ProxyMgr == nil {
		respondWithErrorGin(c, http.StatusInternalServerError, "ProxyManager not available")
		return
	}
	var reqBody struct {
		IDs []string `json:"ids"`
	}
	if c.Request.ContentLength > 0 {
		if err := c.ShouldBindJSON(&reqBody); err != nil {
			respondWithErrorGin(c, http.StatusBadRequest, "Invalid JSON in request body: "+err.Error())
			return
		}
	}

	var message string
	if len(reqBody.IDs) > 0 {
		log.Printf("API: Gin request to force health check for %d specific proxy IDs.", len(reqBody.IDs))
		h.ProxyMgr.ForceCheckProxiesAsync(reqBody.IDs)
		message = fmt.Sprintf("Health check process initiated for %d specified proxies. Check status endpoint.", len(reqBody.IDs))
	} else {
		log.Printf("API: Gin request to force health check for ALL managed proxies.")
		h.ProxyMgr.ForceCheckProxiesAsync(nil)
		message = "Health check process initiated for all managed proxies. Check status endpoint."
	}
	respondWithJSONGin(c, http.StatusAccepted, map[string]string{"message": message})
}

func (h *APIHandler) TestProxyGin(c *gin.Context) {
	proxyIDStr := c.Param("proxyId")
	proxyID, err := uuid.Parse(proxyIDStr)
	if err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid proxy ID format for testing")
		return
	}

	var querier store.Querier
	if h.DB != nil {
		querier = h.DB
	}

	targetProxyModel, err := h.ProxyStore.GetProxyByID(c.Request.Context(), querier, proxyID)
	if err != nil {
		if err == store.ErrNotFound {
			respondWithErrorGin(c, http.StatusNotFound, fmt.Sprintf("Proxy ID '%s' not found for testing", proxyIDStr))
			return
		}
		respondWithErrorGin(c, http.StatusInternalServerError, "Error fetching proxy for testing: "+err.Error())
		return
	}

	proxyCfgForTest := proxyToProxyConfigEntry(targetProxyModel)
	protocolForLog := "unknown"
	if targetProxyModel.Protocol != nil {
		protocolForLog = string(*targetProxyModel.Protocol)
	}
	log.Printf("API: Gin Testing proxy ID '%s' (%s://%s)", targetProxyModel.ID, protocolForLog, targetProxyModel.Address)
	testResult := proxymanager.TestProxy(proxyCfgForTest)
	respondWithJSONGin(c, http.StatusOK, testResult)
}
