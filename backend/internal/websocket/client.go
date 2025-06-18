package websocket

import (
	"bytes"
	"encoding/json"
	"log"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

const (
	// Time allowed to write a message to the peer.
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer.
	pongWait = 60 * time.Second

	// Send pings to peer with this period. Must be less than pongWait.
	pingPeriod = (pongWait * 9) / 10

	// Maximum message size allowed from peer.
	maxMessageSize = 512
)

var (
	newline = []byte{'\n'} // Corrected: Use '\n' for the newline character in a byte slice
	space   = []byte{' '}
)

// Global sequence counter for message ordering
var globalSequenceCounter int64

// WebSocketMessage represents a structured message for campaign-specific routing
// Phase 2.2: Added ID and SequenceNumber for message ordering
type WebSocketMessage struct {
	ID             string      `json:"id"`
	Timestamp      string      `json:"timestamp"`
	Type           string      `json:"type"`
	SequenceNumber int64       `json:"sequenceNumber"`
	Data           interface{} `json:"data,omitempty"`
	Payload        interface{} `json:"payload,omitempty"`
	Message        string      `json:"message,omitempty"`
	CampaignID     string      `json:"campaignId,omitempty"`
	Phase          string      `json:"phase,omitempty"`
	Status         string      `json:"status,omitempty"`
	Progress       float64     `json:"progress,omitempty"`
	ErrorMessage   string      `json:"error,omitempty"`
	
	// Real-time update specific fields
	ProxyID        string      `json:"proxyId,omitempty"`
	ProxyStatus    string      `json:"proxyStatus,omitempty"`
	PersonaID      string      `json:"personaId,omitempty"`
	PersonaStatus  string      `json:"personaStatus,omitempty"`
	ValidationsProcessed int64 `json:"validationsProcessed,omitempty"`
	DomainsGenerated     int64 `json:"domainsGenerated,omitempty"`
	EstimatedTimeRemaining string `json:"estimatedTimeRemaining,omitempty"`
}

// ClientMessage represents messages received from the client
type ClientMessage struct {
	Type               string `json:"type"`
	CampaignID         string `json:"campaignId,omitempty"`
	LastSequenceNumber int64  `json:"lastSequenceNumber,omitempty"`
}

// Client is a middleman between the websocket connection and the hub.
type Client struct {
	hub Broadcaster

	// The websocket connection.
	conn *websocket.Conn

	// Buffered channel of outbound messages.
	send chan []byte

	// Campaign subscriptions for this client
	campaignSubscriptions map[string]bool
	subscriptionMutex     sync.RWMutex

	// Sequence tracking per subscription
	sequenceNumbers map[string]int64

	// Security context for authentication and authorization
	securityContext *SecurityContext
}

// readPump pumps messages from the websocket connection to the hub.
func (c *Client) readPump() {
	defer func() {
		c.hub.UnregisterClient(c)
		c.conn.Close()
	}()
	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error { c.conn.SetReadDeadline(time.Now().Add(pongWait)); return nil })
	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("websocket read error: %v", err)
			}
			break
		}
		message = bytes.TrimSpace(bytes.Replace(message, newline, space, -1))
		log.Printf("Client %s received: %s", c.conn.RemoteAddr().String(), string(message))

		// Handle campaign subscription messages
		c.handleMessage(message)
	}
}

// writePump pumps messages from the hub to the websocket connection.
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()
	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// The hub closed the channel.
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				log.Printf("websocket next writer error: %v", err)
				return
			}
			w.Write(message)

			// Add queued messages to the current websocket message.
			n := len(c.send)
			for i := 0; i < n; i++ {
				w.Write(newline) // Ensure newline is written correctly
				w.Write(<-c.send)
			}

			if err := w.Close(); err != nil {
				log.Printf("websocket writer close error: %v", err)
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				log.Printf("websocket ping error: %v", err)
				return
			}
		}
	}
}

// handleMessage processes incoming messages from the client for campaign subscriptions
func (c *Client) handleMessage(message []byte) {
	var clientMsg ClientMessage
	if err := json.Unmarshal(message, &clientMsg); err != nil {
		// Try to parse as old format for backward compatibility
		var wsMsg WebSocketMessage
		if err2 := json.Unmarshal(message, &wsMsg); err2 == nil {
			// Convert old format to new
			clientMsg.Type = wsMsg.Type
			clientMsg.CampaignID = wsMsg.CampaignID
		} else {
			log.Printf("Failed to parse WebSocket message: %v", err)
			return
		}
	}

	switch clientMsg.Type {
	case "connection_init":
		// Handle connection initialization with last sequence number
		log.Printf("Client %s initialized connection with last sequence: %d",
			c.conn.RemoteAddr().String(), clientMsg.LastSequenceNumber)

		// Send acknowledgment
		response := c.createMessage("connection_ack", nil)
		userId := ""
		if c.securityContext != nil {
			userId = c.securityContext.UserID
		}
		response.Data = map[string]interface{}{
			"connectionId":       uuid.New().String(),
			"userId":             userId,
			"lastSequenceNumber": clientMsg.LastSequenceNumber,
		}
		c.sendMessage(response)

	case "subscribe_campaign":
		if clientMsg.CampaignID != "" {
			c.subscriptionMutex.Lock()
			c.campaignSubscriptions[clientMsg.CampaignID] = true
			// Track last sequence number for this subscription
			if clientMsg.LastSequenceNumber > 0 {
				c.sequenceNumbers[clientMsg.CampaignID] = clientMsg.LastSequenceNumber
			}
			c.subscriptionMutex.Unlock()

			log.Printf("Client %s subscribed to campaign %s with last sequence: %d",
				c.conn.RemoteAddr().String(), clientMsg.CampaignID, clientMsg.LastSequenceNumber)

			// Send confirmation
			response := c.createMessage("subscription_confirmed", &clientMsg.CampaignID)
			response.Message = "Successfully subscribed to campaign updates"
			response.Data = map[string]interface{}{
				"lastSequenceNumber": clientMsg.LastSequenceNumber,
			}
			c.sendMessage(response)
		}

	case "unsubscribe_campaign":
		if clientMsg.CampaignID != "" {
			c.subscriptionMutex.Lock()
			delete(c.campaignSubscriptions, clientMsg.CampaignID)
			delete(c.sequenceNumbers, clientMsg.CampaignID)
			c.subscriptionMutex.Unlock()

			log.Printf("Client %s unsubscribed from campaign %s",
				c.conn.RemoteAddr().String(), clientMsg.CampaignID)
		}

	case "ping":
		// Handle ping messages
		response := c.createMessage("pong", nil)
		c.sendMessage(response)

	default:
		log.Printf("Unknown message type: %s", clientMsg.Type)
	}
}

// createMessage creates a new WebSocket message with proper ID, timestamp, and sequence number
func (c *Client) createMessage(msgType string, campaignID *string) WebSocketMessage {
	msg := WebSocketMessage{
		ID:             uuid.New().String(),
		Timestamp:      time.Now().UTC().Format(time.RFC3339),
		Type:           msgType,
		SequenceNumber: atomic.AddInt64(&globalSequenceCounter, 1),
	}

	if campaignID != nil {
		msg.CampaignID = *campaignID
	}

	return msg
}

// sendMessage sends a structured message to the client
func (c *Client) sendMessage(msg WebSocketMessage) {
	// Ensure message has required fields
	if msg.ID == "" {
		msg.ID = uuid.New().String()
	}
	if msg.Timestamp == "" {
		msg.Timestamp = time.Now().UTC().Format(time.RFC3339)
	}
	if msg.SequenceNumber == 0 {
		msg.SequenceNumber = atomic.AddInt64(&globalSequenceCounter, 1)
	}

	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("Failed to marshal WebSocket message: %v", err)
		return
	}

	select {
	case c.send <- data:
	default:
		close(c.send)
		c.hub.UnregisterClient(c)
	}
}

// IsSubscribedToCampaign checks if the client is subscribed to a specific campaign
func (c *Client) IsSubscribedToCampaign(campaignID string) bool {
	c.subscriptionMutex.RLock()
	defer c.subscriptionMutex.RUnlock()
	return c.campaignSubscriptions[campaignID]
}

// GetLastSequenceNumber returns the last sequence number for a campaign subscription
func (c *Client) GetLastSequenceNumber(campaignID string) int64 {
	c.subscriptionMutex.RLock()
	defer c.subscriptionMutex.RUnlock()
	return c.sequenceNumbers[campaignID]
}

// NewClient creates a new client, registers it with the hub, and starts its read/write pumps.
func NewClient(hub Broadcaster, conn *websocket.Conn) *Client {
	client := &Client{
		hub:                   hub,
		conn:                  conn,
		send:                  make(chan []byte, 256), // Buffered channel for outbound messages
		campaignSubscriptions: make(map[string]bool),
		sequenceNumbers:       make(map[string]int64),
	}
	client.hub.RegisterClient(client) // Register client with the hub

	// Start goroutines for reading and writing messages for this client.
	go client.writePump()
	go client.readPump()

	return client
}

// NewClientWithSecurity creates a new client with security context
func NewClientWithSecurity(hub Broadcaster, conn *websocket.Conn, securityContext *SecurityContext) *Client {
	client := &Client{
		hub:                   hub,
		conn:                  conn,
		send:                  make(chan []byte, 256), // Buffered channel for outbound messages
		campaignSubscriptions: make(map[string]bool),
		sequenceNumbers:       make(map[string]int64),
		securityContext:       securityContext,
	}
	client.hub.RegisterClient(client) // Register client with the hub

	// Start goroutines for reading and writing messages for this client.
	go client.writePump()
	go client.readPump()

	return client
}

// GetSecurityContext returns the client's security context
func (c *Client) GetSecurityContext() *SecurityContext {
	return c.securityContext
}

// CreateCampaignProgressMessage creates a standardized campaign progress message
func CreateCampaignProgressMessage(campaignID string, progress float64, status string, phase string) WebSocketMessage {
	return WebSocketMessage{
		ID:             uuid.New().String(),
		Timestamp:      time.Now().UTC().Format(time.RFC3339),
		Type:           "campaign_progress",
		SequenceNumber: atomic.AddInt64(&globalSequenceCounter, 1),
		CampaignID:     campaignID,
		Status:         status,
		Phase:          phase,
		Progress:       progress,
	}
}

// CreateProxyStatusMessage creates a standardized proxy status update message
func CreateProxyStatusMessage(proxyID, status string, campaignID string) WebSocketMessage {
	return WebSocketMessage{
		ID:             uuid.New().String(),
		Timestamp:      time.Now().UTC().Format(time.RFC3339),
		Type:           "proxy_status_update",
		SequenceNumber: atomic.AddInt64(&globalSequenceCounter, 1),
		CampaignID:     campaignID,
		ProxyID:        proxyID,
		ProxyStatus:    status,
	}
}

// CreateDomainGenerationMessage creates a message for domain generation progress
func CreateDomainGenerationMessage(campaignID string, domainsGenerated int64, totalDomains int64) WebSocketMessage {
	progress := 0.0
	if totalDomains > 0 {
		progress = float64(domainsGenerated) / float64(totalDomains) * 100
	}
	
	return WebSocketMessage{
		ID:               uuid.New().String(),
		Timestamp:        time.Now().UTC().Format(time.RFC3339),
		Type:             "domain_generation_progress",
		SequenceNumber:   atomic.AddInt64(&globalSequenceCounter, 1),
		CampaignID:       campaignID,
		DomainsGenerated: domainsGenerated,
		Progress:         progress,
		Status:           "generating",
		Phase:            "domain_generation",
	}
}

// CreateValidationProgressMessage creates a message for validation progress
func CreateValidationProgressMessage(campaignID string, validationsProcessed int64, totalValidations int64, validationType string) WebSocketMessage {
	progress := 0.0
	if totalValidations > 0 {
		progress = float64(validationsProcessed) / float64(totalValidations) * 100
	}
	
	return WebSocketMessage{
		ID:                   uuid.New().String(),
		Timestamp:            time.Now().UTC().Format(time.RFC3339),
		Type:                 "validation_progress",
		SequenceNumber:       atomic.AddInt64(&globalSequenceCounter, 1),
		CampaignID:           campaignID,
		ValidationsProcessed: validationsProcessed,
		Progress:             progress,
		Status:               "validating",
		Phase:                validationType,
	}
}

// CreateSystemNotificationMessage creates a system-wide notification message
func CreateSystemNotificationMessage(message string, level string) WebSocketMessage {
	return WebSocketMessage{
		ID:             uuid.New().String(),
		Timestamp:      time.Now().UTC().Format(time.RFC3339),
		Type:           "system_notification",
		SequenceNumber: atomic.AddInt64(&globalSequenceCounter, 1),
		Message:        message,
		Status:         level, // info, warning, error, success
	}
}

// BroadcastCampaignProgress broadcasts campaign progress to subscribed clients
func BroadcastCampaignProgress(campaignID string, progress float64, status string, phase string) {
	if broadcaster := GetBroadcaster(); broadcaster != nil {
		message := CreateCampaignProgressMessage(campaignID, progress, status, phase)
		broadcaster.BroadcastToCampaign(campaignID, message)
	}
}

// BroadcastProxyStatus broadcasts proxy status updates to subscribed clients
func BroadcastProxyStatus(proxyID, status string, campaignID string) {
	if broadcaster := GetBroadcaster(); broadcaster != nil {
		message := CreateProxyStatusMessage(proxyID, status, campaignID)
		broadcaster.BroadcastToCampaign(campaignID, message)
	}
}

// BroadcastDomainGeneration broadcasts domain generation progress
func BroadcastDomainGeneration(campaignID string, domainsGenerated int64, totalDomains int64) {
	if broadcaster := GetBroadcaster(); broadcaster != nil {
		message := CreateDomainGenerationMessage(campaignID, domainsGenerated, totalDomains)
		broadcaster.BroadcastToCampaign(campaignID, message)
	}
}

// BroadcastValidationProgress broadcasts validation progress
func BroadcastValidationProgress(campaignID string, validationsProcessed int64, totalValidations int64, validationType string) {
	if broadcaster := GetBroadcaster(); broadcaster != nil {
		message := CreateValidationProgressMessage(campaignID, validationsProcessed, totalValidations, validationType)
		broadcaster.BroadcastToCampaign(campaignID, message)
	}
}

// BroadcastSystemNotification broadcasts system-wide notifications
func BroadcastSystemNotification(message string, level string) {
	if broadcaster := GetBroadcaster(); broadcaster != nil {
		notification := CreateSystemNotificationMessage(message, level)
		if data, err := json.Marshal(notification); err == nil {
			broadcaster.BroadcastMessage(data)
		}
	}
}
