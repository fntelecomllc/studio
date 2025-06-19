package models

import (
	"time"
	"github.com/google/uuid"
)

// UserAPI represents a user in API responses (without sensitive fields and with string IP)
type UserAPI struct {
	ID                uuid.UUID  `json:"id" example:"123e4567-e89b-12d3-a456-426614174000"`
	Email             string     `json:"email" example:"user@example.com"`
	EmailVerified     bool       `json:"emailVerified" example:"true"`
	FirstName         string     `json:"firstName" example:"John"`
	LastName          string     `json:"lastName" example:"Doe"`
	AvatarURL         *string    `json:"avatarUrl,omitempty" example:"https://example.com/avatar.jpg"`
	IsActive          bool       `json:"isActive" example:"true"`
	IsLocked          bool       `json:"isLocked" example:"false"`
	LastLoginAt       *time.Time `json:"lastLoginAt,omitempty"`
	LastLoginIP       *string    `json:"lastLoginIp,omitempty" example:"192.168.1.1"`
	MustChangePassword bool      `json:"mustChangePassword" example:"false"`
	MFAEnabled        bool       `json:"mfaEnabled" example:"false"`
	MFALastUsedAt     *time.Time `json:"mfaLastUsedAt,omitempty"`
	CreatedAt         time.Time  `json:"createdAt"`
	UpdatedAt         time.Time  `json:"updatedAt"`
	Name              string     `json:"name" example:"John Doe"`
	Roles             []string   `json:"roles" example:"user,admin"`
	Permissions       []string   `json:"permissions" example:"campaigns:read,campaigns:create"`
}

// LoginResponseAPI represents a login response for API documentation
type LoginResponseAPI struct {
	Success         bool     `json:"success" example:"true"`
	User            *UserAPI `json:"user,omitempty"`
	Error           string   `json:"error,omitempty" example:"Invalid credentials"`
	RequiresCaptcha bool     `json:"requires_captcha,omitempty" example:"false"`
	SessionID       string   `json:"sessionId,omitempty" example:"sess_123456789"`
	ExpiresAt       string   `json:"expiresAt,omitempty" example:"2025-06-19T14:00:00Z"`
}

// CampaignAPI represents a campaign in API responses
type CampaignAPI struct {
	ID                      uuid.UUID             `json:"id" example:"123e4567-e89b-12d3-a456-426614174000"`
	Name                    string                `json:"name" example:"Domain Discovery Campaign"`
	CampaignType            CampaignTypeEnum      `json:"campaignType" example:"domain_generation"`
	Status                  CampaignStatusEnum    `json:"status" example:"running"`
	UserID                  *uuid.UUID            `json:"userId,omitempty" example:"123e4567-e89b-12d3-a456-426614174001"`
	CreatedAt               time.Time             `json:"createdAt"`
	UpdatedAt               time.Time             `json:"updatedAt"`
	StartedAt               *time.Time            `json:"startedAt,omitempty"`
	CompletedAt             *time.Time            `json:"completedAt,omitempty"`
	ProgressPercentage      *float64              `json:"progressPercentage,omitempty" example:"75.5"`
	TotalItems              *int64                `json:"totalItems,omitempty" example:"1000"`
	ProcessedItems          *int64                `json:"processedItems,omitempty" example:"755"`
	SuccessfulItems         *int64                `json:"successfulItems,omitempty" example:"700"`
	FailedItems             *int64                `json:"failedItems,omitempty" example:"55"`
	ErrorMessage            *string               `json:"errorMessage,omitempty" example:"Network timeout error"`
	Metadata                interface{}           `json:"metadata,omitempty" swaggertype:"object"`
	EstimatedCompletionAt   *time.Time            `json:"estimatedCompletionAt,omitempty"`
	AvgProcessingRate       *float64              `json:"avgProcessingRate,omitempty" example:"10.5"`
	LastHeartbeatAt         *time.Time            `json:"lastHeartbeatAt,omitempty"`
}
