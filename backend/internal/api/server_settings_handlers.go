// File: backend/internal/api/server_settings_handlers.go
package api

import (
	"log"
	"net/http"

	"github.com/fntelecomllc/studio/backend/internal/config"
	"github.com/gin-gonic/gin"
)

// GetServerConfigGin retrieves current server-wide configurations.
// GET /api/v2/config/server
func (h *APIHandler) GetServerConfigGin(c *gin.Context) {
	h.configMutex.RLock()
	// Expose only specific, safe-to-view fields. APIKey should not be exposed.
	serverConfigDTO := struct {
		Port            string `json:"port"`
		StreamChunkSize int    `json:"streamChunkSize"`
		GinMode         string `json:"ginMode"`
		// Add other relevant server config fields, but NOT APIKey or sensitive DB creds
	}{
		Port:            h.Config.Server.Port,
		StreamChunkSize: h.Config.Server.StreamChunkSize,
		GinMode:         h.Config.Server.GinMode,
	}
	h.configMutex.RUnlock()
	respondWithJSONGin(c, http.StatusOK, serverConfigDTO)
}

// UpdateServerConfigGin updates server-wide configurations.
// PUT /api/v2/config/server
func (h *APIHandler) UpdateServerConfigGin(c *gin.Context) {
	var reqServerConfigUpdate struct {
		StreamChunkSize *int    `json:"streamChunkSize,omitempty"`
		GinMode         *string `json:"ginMode,omitempty"`
		// Add other updatable, non-sensitive fields
	}
	if err := c.ShouldBindJSON(&reqServerConfigUpdate); err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid request payload: "+err.Error())
		return
	}

	configChanged := false
	h.configMutex.Lock()
	if reqServerConfigUpdate.StreamChunkSize != nil {
		if *reqServerConfigUpdate.StreamChunkSize > 0 {
			if h.Config.Server.StreamChunkSize != *reqServerConfigUpdate.StreamChunkSize {
				h.Config.Server.StreamChunkSize = *reqServerConfigUpdate.StreamChunkSize
				configChanged = true
				log.Printf("API: Server StreamChunkSize updated to: %d", h.Config.Server.StreamChunkSize)
			}
		} else {
			log.Printf("API Warning: UpdateServerConfigGin - Invalid StreamChunkSize received: %d. Not updating.", *reqServerConfigUpdate.StreamChunkSize)
		}
	}
	if reqServerConfigUpdate.GinMode != nil {
		validGinModes := map[string]bool{"debug": true, "release": true, "test": true}
		if validGinModes[*reqServerConfigUpdate.GinMode] {
			if h.Config.Server.GinMode != *reqServerConfigUpdate.GinMode {
				h.Config.Server.GinMode = *reqServerConfigUpdate.GinMode
				configChanged = true
				log.Printf("API: Server GinMode updated to: %s", h.Config.Server.GinMode)
			}
		} else {
			log.Printf("API Warning: UpdateServerConfigGin - Invalid GinMode received: %s. Not updating.", *reqServerConfigUpdate.GinMode)
		}
	}

	if configChanged {
		if err := config.SaveAppConfig(h.Config); err != nil { // Assuming SaveAppConfig correctly uses h.Config.GetLoadedFromPath()
			h.configMutex.Unlock()
			log.Printf("API Error: UpdateServerConfigGin - Failed to save updated server config: %v", err)
			respondWithErrorGin(c, http.StatusInternalServerError, "Failed to save server configuration")
			return
		}
	}
	h.configMutex.Unlock()

	// Respond with current (potentially updated) settings
	currentServerConfigDTO := struct {
		Port            string `json:"port"`
		StreamChunkSize int    `json:"streamChunkSize"`
		GinMode         string `json:"ginMode"`
	}{
		Port:            h.Config.Server.Port,
		StreamChunkSize: h.Config.Server.StreamChunkSize,
		GinMode:         h.Config.Server.GinMode,
	}
	respondWithJSONGin(c, http.StatusOK, currentServerConfigDTO)
}

// GetDNSConfigGin retrieves the default DNS validator configuration.
// GET /api/v2/config/dns
func (h *APIHandler) GetDNSConfigGin(c *gin.Context) {
	h.configMutex.RLock()
	// Assuming ConvertDNSConfigToJSON handles sensitive data appropriately if any
	dnsConfigJSON := config.ConvertDNSConfigToJSON(h.Config.DNSValidator)
	h.configMutex.RUnlock()
	respondWithJSONGin(c, http.StatusOK, dnsConfigJSON)
}

// UpdateDNSConfigGin updates the default DNS validator configuration.
// POST /api/v2/config/dns
func (h *APIHandler) UpdateDNSConfigGin(c *gin.Context) {
	var reqJSON config.DNSValidatorConfigJSON
	if err := c.ShouldBindJSON(&reqJSON); err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}

	updatedDNSConfig := config.ConvertJSONToDNSConfig(reqJSON)
	// Basic validation (example, can be expanded in config package or here)
	if updatedDNSConfig.QueryTimeoutSeconds <= 0 {
		respondWithErrorGin(c, http.StatusBadRequest, "queryTimeoutSeconds must be positive")
		return
	}

	h.configMutex.Lock()
	h.Config.DNSValidator = updatedDNSConfig
	// Create a copy for saving if SaveAppConfig modifies the passed pointer or for safety
	// configToSave := *h.Config
	h.configMutex.Unlock()

	// Save the entire AppConfig
	if err := config.SaveAppConfig(h.Config); err != nil {
		log.Printf("API Error: Failed to save updated DNS config: %v", err)
		// Potentially revert in-memory change if save fails and that's desired behavior
		respondWithErrorGin(c, http.StatusInternalServerError, "Failed to save DNS configuration")
		return
	}
	log.Printf("API: Updated server default DNS configuration.")
	// Respond with the DTO that was accepted and converted
	respondWithJSONGin(c, http.StatusOK, config.ConvertDNSConfigToJSON(updatedDNSConfig))
}

// GetHTTPConfigGin retrieves the default HTTP validator configuration.
// GET /api/v2/config/http
func (h *APIHandler) GetHTTPConfigGin(c *gin.Context) {
	h.configMutex.RLock()
	httpConfigJSON := config.ConvertHTTPConfigToJSON(h.Config.HTTPValidator)
	h.configMutex.RUnlock()
	respondWithJSONGin(c, http.StatusOK, httpConfigJSON)
}

// UpdateHTTPConfigGin updates the default HTTP validator configuration.
// POST /api/v2/config/http
func (h *APIHandler) UpdateHTTPConfigGin(c *gin.Context) {
	var reqJSON config.HTTPValidatorConfigJSON
	if err := c.ShouldBindJSON(&reqJSON); err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}
	updatedHTTPConfig := config.ConvertJSONToHTTPConfig(reqJSON)
	// Add any necessary validation for updatedHTTPConfig fields here

	h.configMutex.Lock()
	h.Config.HTTPValidator = updatedHTTPConfig
	h.configMutex.Unlock()

	if err := config.SaveAppConfig(h.Config); err != nil {
		log.Printf("API Error: Failed to save updated HTTP config: %v", err)
		respondWithErrorGin(c, http.StatusInternalServerError, "Failed to save HTTP configuration")
		return
	}
	log.Printf("API: Updated server default HTTP configuration.")
	respondWithJSONGin(c, http.StatusOK, config.ConvertHTTPConfigToJSON(updatedHTTPConfig))
}

// GetLoggingConfigGin retrieves the current logging configuration.
// GET /api/v2/config/logging
func (h *APIHandler) GetLoggingConfigGin(c *gin.Context) {
	h.configMutex.RLock()
	loggingConfig := h.Config.Logging
	h.configMutex.RUnlock()
	respondWithJSONGin(c, http.StatusOK, loggingConfig)
}

// UpdateLoggingConfigGin updates the logging configuration.
// POST /api/v2/config/logging
func (h *APIHandler) UpdateLoggingConfigGin(c *gin.Context) {
	var reqLogging config.LoggingConfig
	if err := c.ShouldBindJSON(&reqLogging); err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}
	// Validate logging level if necessary
	validLevels := map[string]bool{"DEBUG": true, "INFO": true, "WARN": true, "ERROR": true}
	if !validLevels[reqLogging.Level] {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid logging level")
		return
	}

	h.configMutex.Lock()
	h.Config.Logging = reqLogging
	h.configMutex.Unlock()

	if err := config.SaveAppConfig(h.Config); err != nil {
		log.Printf("API Error: Failed to save updated Logging config: %v", err)
		respondWithErrorGin(c, http.StatusInternalServerError, "Failed to save Logging configuration")
		return
	}
	log.Printf("API: Updated server Logging configuration. New level: %s", reqLogging.Level)
	// TODO: Apply new logging level dynamically to the logger if possible
	respondWithJSONGin(c, http.StatusOK, reqLogging)
}
