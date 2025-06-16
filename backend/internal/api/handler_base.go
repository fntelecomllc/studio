// File: backend/internal/api/handler_base.go
package api

import (
	"sync"

	"github.com/fntelecomllc/studio/backend/internal/config"
	"github.com/fntelecomllc/studio/backend/internal/proxymanager"
	"github.com/fntelecomllc/studio/backend/internal/store"
	"github.com/jmoiron/sqlx" // Added for sqlx.DB
)

// APIHandler holds shared dependencies for API handlers.
// It uses persistent stores and core utility services.
type APIHandler struct {
	Config      *config.AppConfig
	DB          *sqlx.DB // Added DB field for direct Querier access
	ProxyMgr    *proxymanager.ProxyManager
	configMutex sync.RWMutex

	CampaignStore    store.CampaignStore
	PersonaStore     store.PersonaStore
	ProxyStore       store.ProxyStore
	KeywordStore     store.KeywordStore
	AuditLogStore    store.AuditLogStore
	CampaignJobStore store.CampaignJobStore
}

// NewAPIHandler creates a new APIHandler with core dependencies.
func NewAPIHandler(
	cfg *config.AppConfig,
	db *sqlx.DB, // Added db parameter
	pm *proxymanager.ProxyManager,
	campaignStore store.CampaignStore,
	personaStore store.PersonaStore,
	proxyStore store.ProxyStore,
	keywordStore store.KeywordStore,
	auditLogStore store.AuditLogStore,
	campaignJobStore store.CampaignJobStore,
) *APIHandler {
	return &APIHandler{
		Config:           cfg,
		DB:               db, // Store db instance
		ProxyMgr:         pm,
		CampaignStore:    campaignStore,
		PersonaStore:     personaStore,
		ProxyStore:       proxyStore,
		KeywordStore:     keywordStore,
		AuditLogStore:    auditLogStore,
		CampaignJobStore: campaignJobStore,
	}
}
