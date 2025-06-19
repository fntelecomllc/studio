package websocket

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// StandardizedWebSocketMessage represents the new unified message structure
type StandardizedWebSocketMessage struct {
	Type      string          `json:"type"`
	Timestamp time.Time       `json:"timestamp"`
	Data      json.RawMessage `json:"data"`
}

// CampaignProgressPayload represents campaign progress update data
type CampaignProgressPayload struct {
	CampaignID       string  `json:"campaignId"`
	TotalItems       int64   `json:"totalItems"`
	ProcessedItems   int64   `json:"processedItems"`
	SuccessfulItems  int64   `json:"successfulItems"`
	FailedItems      int64   `json:"failedItems"`
	ProgressPercent  float64 `json:"progressPercent"`
	Phase            string  `json:"phase"`
	Status           string  `json:"status"`
}

// CampaignStatusPayload represents campaign status changes
type CampaignStatusPayload struct {
	CampaignID string `json:"campaignId"`
	Status     string `json:"status"`
	Phase      string `json:"phase,omitempty"`
	Message    string `json:"message,omitempty"`
	ErrorCode  string `json:"errorCode,omitempty"`
}

// DomainGenerationPayload represents domain generation events
type DomainGenerationPayload struct {
	CampaignID    string `json:"campaignId"`
	DomainID      string `json:"domainId"`
	Domain        string `json:"domain"`
	Offset        int64  `json:"offset"`
	BatchSize     int    `json:"batchSize"`
	TotalGenerated int64 `json:"totalGenerated"`
}

// DNSValidationPayload represents DNS validation results
type DNSValidationPayload struct {
	CampaignID         string                 `json:"campaignId"`
	DomainID           string                 `json:"domainId"`
	Domain             string                 `json:"domain"`
	ValidationStatus   string                 `json:"validationStatus"`
	DNSRecords         map[string]interface{} `json:"dnsRecords,omitempty"`
	Attempts           int                    `json:"attempts"`
	ProcessingTime     int64                  `json:"processingTime"` // milliseconds
	TotalValidated     int64                  `json:"totalValidated"`
}

// HTTPValidationPayload represents HTTP validation results
type HTTPValidationPayload struct {
	CampaignID       string                 `json:"campaignId"`
	DomainID         string                 `json:"domainId"`
	Domain           string                 `json:"domain"`
	ValidationStatus string                 `json:"validationStatus"`
	HTTPStatus       int                    `json:"httpStatus,omitempty"`
	Keywords         []string               `json:"keywords,omitempty"`
	Content          string                 `json:"content,omitempty"`
	Headers          map[string]interface{} `json:"headers,omitempty"`
	ProcessingTime   int64                  `json:"processingTime"` // milliseconds
	TotalValidated   int64                  `json:"totalValidated"`
}

// SystemNotificationPayload represents system-wide notifications
type SystemNotificationPayload struct {
	Level      string `json:"level"`      // info, warning, error
	Message    string `json:"message"`
	Category   string `json:"category,omitempty"`   // campaign, system, user
	Actionable bool   `json:"actionable,omitempty"` // requires user action
}

// ProxyStatusPayload represents proxy status updates
type ProxyStatusPayload struct {
	ProxyID    string `json:"proxyId"`
	Status     string `json:"status"`
	CampaignID string `json:"campaignId,omitempty"`
	Health     string `json:"health,omitempty"`
	ResponseTime int64 `json:"responseTime,omitempty"` // milliseconds
}

// Helper functions to create standardized messages

// CreateCampaignProgressMessageV2 creates a standardized campaign progress message
func CreateCampaignProgressMessageV2(payload CampaignProgressPayload) StandardizedWebSocketMessage {
	data, _ := json.Marshal(payload)
	return StandardizedWebSocketMessage{
		Type:      "campaign.progress",
		Timestamp: time.Now(),
		Data:      data,
	}
}

// CreateCampaignStatusMessageV2 creates a standardized campaign status message
func CreateCampaignStatusMessageV2(payload CampaignStatusPayload) StandardizedWebSocketMessage {
	data, _ := json.Marshal(payload)
	return StandardizedWebSocketMessage{
		Type:      "campaign.status",
		Timestamp: time.Now(),
		Data:      data,
	}
}

// CreateDomainGenerationMessageV2 creates a standardized domain generation message
func CreateDomainGenerationMessageV2(payload DomainGenerationPayload) StandardizedWebSocketMessage {
	data, _ := json.Marshal(payload)
	return StandardizedWebSocketMessage{
		Type:      "domain.generated",
		Timestamp: time.Now(),
		Data:      data,
	}
}

// CreateDNSValidationMessageV2 creates a standardized DNS validation message
func CreateDNSValidationMessageV2(payload DNSValidationPayload) StandardizedWebSocketMessage {
	data, _ := json.Marshal(payload)
	return StandardizedWebSocketMessage{
		Type:      "dns.validation.result",
		Timestamp: time.Now(),
		Data:      data,
	}
}

// CreateHTTPValidationMessageV2 creates a standardized HTTP validation message
func CreateHTTPValidationMessageV2(payload HTTPValidationPayload) StandardizedWebSocketMessage {
	data, _ := json.Marshal(payload)
	return StandardizedWebSocketMessage{
		Type:      "http.validation.result",
		Timestamp: time.Now(),
		Data:      data,
	}
}

// CreateSystemNotificationMessageV2 creates a standardized system notification message
func CreateSystemNotificationMessageV2(payload SystemNotificationPayload) StandardizedWebSocketMessage {
	data, _ := json.Marshal(payload)
	return StandardizedWebSocketMessage{
		Type:      "system.notification",
		Timestamp: time.Now(),
		Data:      data,
	}
}

// CreateProxyStatusMessageV2 creates a standardized proxy status message
func CreateProxyStatusMessageV2(payload ProxyStatusPayload) StandardizedWebSocketMessage {
	data, _ := json.Marshal(payload)
	return StandardizedWebSocketMessage{
		Type:      "proxy.status",
		Timestamp: time.Now(),
		Data:      data,
	}
}

// Legacy compatibility functions that convert old message format to new format

// ConvertLegacyMessage converts old WebSocketMessage to new standardized format
func ConvertLegacyMessage(legacy WebSocketMessage) (StandardizedWebSocketMessage, error) {
	var msgType string
	var payload interface{}

	switch legacy.Type {
	case "campaign_progress":
		msgType = "campaign.progress"
		payload = CampaignProgressPayload{
			CampaignID:      legacy.CampaignID,
			ProgressPercent: legacy.Progress,
			Phase:           legacy.Phase,
			Status:          legacy.Status,
			// Note: ProcessedItems, TotalItems would need to be extracted from legacy.Data
		}
	case "domain_generated":
		msgType = "domain.generated"
		// Extract from legacy.Data if available
	case "dns_validation_result":
		msgType = "dns.validation.result"
		// Extract from legacy.Data if available
	case "system_notification":
		msgType = "system.notification"
		payload = SystemNotificationPayload{
			Message: legacy.Message,
			Level:   "info", // default
		}
	default:
		msgType = legacy.Type
		payload = legacy.Data
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return StandardizedWebSocketMessage{}, err
	}

	return StandardizedWebSocketMessage{
		Type:      msgType,
		Timestamp: time.Now(),
		Data:      data,
	}, nil
}

// BroadcastStandardizedMessage broadcasts a standardized message to campaign subscribers
func (m *WebSocketManager) BroadcastStandardizedMessage(campaignID string, message StandardizedWebSocketMessage) {
	m.mutex.RLock()
	defer m.mutex.RUnlock()

	// Convert to JSON for broadcasting
	messageBytes, err := json.Marshal(message)
	if err != nil {
		return
	}

	// Broadcast to all clients subscribed to this campaign
	for client := range m.clients {
		select {
		case client.send <- messageBytes:
		default:
			close(client.send)
			delete(m.clients, client)
		}
	}
}
