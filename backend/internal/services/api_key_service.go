package services

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// APIKeyService handles API key generation, validation, and rotation
type APIKeyService struct {
	encryptionService *EncryptionService
}

// NewAPIKeyService creates a new API key service
func NewAPIKeyService(encryptionService *EncryptionService) *APIKeyService {
	return &APIKeyService{
		encryptionService: encryptionService,
	}
}

// APIKey represents an API key with metadata
type APIKey struct {
	ID          uuid.UUID
	UserID      string
	KeyName     string
	Key         string // The actual API key (only available on creation)
	KeyHash     string // SHA256 hash of the key for validation
	KeyHint     string // Last 4 characters for identification
	Permissions map[string]interface{}
	ExpiresAt   *time.Time
	LastUsedAt  *time.Time
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// GenerateAPIKey creates a new API key
func (s *APIKeyService) GenerateAPIKey() (string, error) {
	// Generate 32 random bytes
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("failed to generate random bytes: %w", err)
	}

	// Convert to hex string
	return hex.EncodeToString(bytes), nil
}

// HashAPIKey creates a SHA256 hash of the API key
func (s *APIKeyService) HashAPIKey(key string) string {
	hash := sha256.Sum256([]byte(key))
	return hex.EncodeToString(hash[:])
}

// CreateAPIKey creates a new API key for a user
func (s *APIKeyService) CreateAPIKey(userID, keyName string, permissions map[string]interface{}, expiresIn *time.Duration) (*APIKey, error) {
	// Generate the API key
	key, err := s.GenerateAPIKey()
	if err != nil {
		return nil, fmt.Errorf("failed to generate API key: %w", err)
	}

	// Calculate expiration time
	var expiresAt *time.Time
	if expiresIn != nil {
		exp := time.Now().Add(*expiresIn)
		expiresAt = &exp
	}

	// Create the API key object
	apiKey := &APIKey{
		ID:          uuid.New(),
		UserID:      userID,
		KeyName:     keyName,
		Key:         key,
		KeyHash:     s.HashAPIKey(key),
		KeyHint:     key[len(key)-4:], // Last 4 characters
		Permissions: permissions,
		ExpiresAt:   expiresAt,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	return apiKey, nil
}

// ValidateAPIKey checks if an API key is valid
func (s *APIKeyService) ValidateAPIKey(key string, storedHash string) bool {
	return s.HashAPIKey(key) == storedHash
}

// RotateAPIKey creates a new API key to replace an existing one
func (s *APIKeyService) RotateAPIKey(oldKey *APIKey) (*APIKey, error) {
	// Create a new key with the same permissions and user
	newKey, err := s.CreateAPIKey(
		oldKey.UserID,
		oldKey.KeyName,
		oldKey.Permissions,
		nil, // Preserve the original expiration if it exists
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create new API key: %w", err)
	}

	// Preserve the original expiration time if it exists
	if oldKey.ExpiresAt != nil {
		newKey.ExpiresAt = oldKey.ExpiresAt
	}

	return newKey, nil
}

// IsExpired checks if an API key has expired
func (s *APIKeyService) IsExpired(apiKey *APIKey) bool {
	if apiKey.ExpiresAt == nil {
		return false
	}
	return time.Now().After(*apiKey.ExpiresAt)
}

// APIKeyRotationPolicy defines when keys should be rotated
type APIKeyRotationPolicy struct {
	MaxAge             time.Duration // Maximum age before rotation
	MaxUsageCount      int64         // Maximum number of uses before rotation
	RotateOnCompromise bool          // Force rotation if key is compromised
}

// ShouldRotate checks if an API key should be rotated based on policy
func (s *APIKeyService) ShouldRotate(apiKey *APIKey, policy APIKeyRotationPolicy, usageCount int64) bool {
	// Check age
	if policy.MaxAge > 0 && time.Since(apiKey.CreatedAt) > policy.MaxAge {
		return true
	}

	// Check usage count
	if policy.MaxUsageCount > 0 && usageCount >= policy.MaxUsageCount {
		return true
	}

	// Check if expired
	if s.IsExpired(apiKey) {
		return true
	}

	return false
}
