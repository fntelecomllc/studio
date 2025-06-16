package models

import (
	"time"

	"github.com/google/uuid"
)

// User represents a user in the authentication system
type User struct {
	ID                       uuid.UUID  `json:"id" db:"id"`
	Email                    string     `json:"email" db:"email"`
	EmailVerified            bool       `json:"emailVerified" db:"email_verified"`
	EmailVerificationToken   *string    `json:"-" db:"email_verification_token"`
	EmailVerificationExpires *time.Time `json:"-" db:"email_verification_expires_at"`
	PasswordHash             string     `json:"-" db:"password_hash"`
	PasswordPepperVersion    int        `json:"-" db:"password_pepper_version"`
	FirstName                string     `json:"firstName" db:"first_name"`
	LastName                 string     `json:"lastName" db:"last_name"`
	AvatarURL                *string    `json:"avatarUrl" db:"avatar_url"`
	IsActive                 bool       `json:"isActive" db:"is_active"`
	IsLocked                 bool       `json:"isLocked" db:"is_locked"`
	FailedLoginAttempts      int        `json:"-" db:"failed_login_attempts"`
	LockedUntil              *time.Time `json:"-" db:"locked_until"`
	LastLoginAt              *time.Time `json:"lastLoginAt" db:"last_login_at"`
	LastLoginIP              *string    `json:"lastLoginIp" db:"last_login_ip"`
	PasswordChangedAt        time.Time  `json:"-" db:"password_changed_at"`
	MustChangePassword       bool       `json:"mustChangePassword" db:"must_change_password"`
	
	// MFA support fields
	MFAEnabled              bool       `json:"mfaEnabled" db:"mfa_enabled"`
	MFASecretEncrypted      *[]byte    `json:"-" db:"mfa_secret_encrypted"`
	MFABackupCodesEncrypted *[]byte    `json:"-" db:"mfa_backup_codes_encrypted"`
	MFALastUsedAt           *time.Time `json:"mfaLastUsedAt" db:"mfa_last_used_at"`
	
	// Additional security fields
	EncryptedFields             *string `json:"-" db:"encrypted_fields"`                  // JSONB stored as string
	SecurityQuestionsEncrypted  *[]byte `json:"-" db:"security_questions_encrypted"`
	
	CreatedAt                time.Time  `json:"createdAt" db:"created_at"`
	UpdatedAt                time.Time  `json:"updatedAt" db:"updated_at"`

	// Computed fields (not stored in DB)
	Roles       []Role       `json:"roles,omitempty" db:"-"`
	Permissions []Permission `json:"permissions,omitempty" db:"-"`
}

// PublicUser returns a user struct with sensitive fields removed
func (u *User) PublicUser() *User {
	return &User{
		ID:                 u.ID,
		Email:              u.Email,
		EmailVerified:      u.EmailVerified,
		FirstName:          u.FirstName,
		LastName:           u.LastName,
		AvatarURL:          u.AvatarURL,
		IsActive:           u.IsActive,
		IsLocked:           u.IsLocked,
		LastLoginAt:        u.LastLoginAt,
		MustChangePassword: u.MustChangePassword,
		MFAEnabled:         u.MFAEnabled,
		MFALastUsedAt:      u.MFALastUsedAt,
		CreatedAt:          u.CreatedAt,
		UpdatedAt:          u.UpdatedAt,
		Roles:              u.Roles,
		Permissions:        u.Permissions,
	}
}

// Session represents a user session with enhanced security features
type Session struct {
	ID                  string     `json:"id" db:"id"`
	UserID              uuid.UUID  `json:"userId" db:"user_id"`
	IPAddress           *string    `json:"ipAddress" db:"ip_address"`
	UserAgent           *string    `json:"userAgent" db:"user_agent"`
	UserAgentHash       *string    `json:"userAgentHash" db:"user_agent_hash"`
	SessionFingerprint  *string    `json:"sessionFingerprint" db:"session_fingerprint"`
	BrowserFingerprint  *string    `json:"browserFingerprint" db:"browser_fingerprint"`
	ScreenResolution    *string    `json:"screenResolution" db:"screen_resolution"`
	IsActive            bool       `json:"isActive" db:"is_active"`
	ExpiresAt           time.Time  `json:"expiresAt" db:"expires_at"`
	LastActivityAt      time.Time  `json:"lastActivityAt" db:"last_activity_at"`
	CreatedAt           time.Time  `json:"createdAt" db:"created_at"`
}

// Role represents a user role
type Role struct {
	ID           uuid.UUID `json:"id" db:"id"`
	Name         string    `json:"name" db:"name"`
	DisplayName  string    `json:"displayName" db:"display_name"`
	Description  *string   `json:"description" db:"description"`
	IsSystemRole bool      `json:"isSystemRole" db:"is_system_role"`
	CreatedAt    time.Time `json:"createdAt" db:"created_at"`
	UpdatedAt    time.Time `json:"updatedAt" db:"updated_at"`

	// Computed fields
	Permissions []Permission `json:"permissions,omitempty" db:"-"`
}

// Permission represents a system permission
type Permission struct {
	ID          uuid.UUID `json:"id" db:"id"`
	Name        string    `json:"name" db:"name"`
	DisplayName string    `json:"displayName" db:"display_name"`
	Description *string   `json:"description" db:"description"`
	Resource    string    `json:"resource" db:"resource"`
	Action      string    `json:"action" db:"action"`
	CreatedAt   time.Time `json:"createdAt" db:"created_at"`
}

// UserRole represents the junction between users and roles
type UserRole struct {
	UserID     uuid.UUID  `json:"userId" db:"user_id"`
	RoleID     uuid.UUID  `json:"roleId" db:"role_id"`
	AssignedBy *uuid.UUID `json:"assignedBy" db:"assigned_by"`
	AssignedAt time.Time  `json:"assignedAt" db:"assigned_at"`
	ExpiresAt  *time.Time `json:"expiresAt" db:"expires_at"`
}

// RolePermission represents the junction between roles and permissions
type RolePermission struct {
	RoleID       uuid.UUID `json:"roleId" db:"role_id"`
	PermissionID uuid.UUID `json:"permissionId" db:"permission_id"`
}

// PasswordResetToken represents a password reset token
type PasswordResetToken struct {
	ID        uuid.UUID  `json:"id" db:"id"`
	UserID    uuid.UUID  `json:"userId" db:"user_id"`
	TokenHash string     `json:"-" db:"token_hash"`
	ExpiresAt time.Time  `json:"expiresAt" db:"expires_at"`
	UsedAt    *time.Time `json:"usedAt" db:"used_at"`
	IPAddress *string    `json:"ipAddress" db:"ip_address"`
	UserAgent *string    `json:"userAgent" db:"user_agent"`
	CreatedAt time.Time  `json:"createdAt" db:"created_at"`
}

// AuthAuditLog represents an enhanced authentication audit log entry
type AuthAuditLog struct {
	ID                 int64      `json:"id" db:"id"`
	UserID             *uuid.UUID `json:"userId" db:"user_id"`
	SessionID          *string    `json:"sessionId" db:"session_id"`
	EventType          string     `json:"eventType" db:"event_type"`
	EventStatus        string     `json:"eventStatus" db:"event_status"`
	IPAddress          *string    `json:"ipAddress" db:"ip_address"`
	UserAgent          *string    `json:"userAgent" db:"user_agent"`
	SessionFingerprint *string    `json:"sessionFingerprint" db:"session_fingerprint"`
	SecurityFlags      *string    `json:"securityFlags" db:"security_flags"` // JSONB stored as string
	Details            *string    `json:"details" db:"details"`                // JSONB stored as string
	RiskScore          int        `json:"riskScore" db:"risk_score"`
	CreatedAt          time.Time  `json:"createdAt" db:"created_at"`
}

// RateLimit represents rate limiting data
type RateLimit struct {
	ID           int64      `json:"id" db:"id"`
	Identifier   string     `json:"identifier" db:"identifier"`
	Action       string     `json:"action" db:"action"`
	Attempts     int        `json:"attempts" db:"attempts"`
	WindowStart  time.Time  `json:"windowStart" db:"window_start"`
	BlockedUntil *time.Time `json:"blockedUntil" db:"blocked_until"`
}

// Authentication request/response models

// LoginRequest represents a login request
type LoginRequest struct {
	Email        string `json:"email" binding:"required,email"`
	Password     string `json:"password" binding:"required,min=12"`
	RememberMe   bool   `json:"rememberMe"`
	CaptchaToken string `json:"captchaToken"`
}

// LoginResponse represents a login response
type LoginResponse struct {
	Success         bool   `json:"success"`
	User            *User  `json:"user,omitempty"`
	Error           string `json:"error,omitempty"`
	RequiresCaptcha bool   `json:"requires_captcha,omitempty"`
	SessionID       string `json:"sessionId,omitempty"`
	CSRFToken       string `json:"csrfToken,omitempty"`
	ExpiresAt       string `json:"expiresAt,omitempty"`
}

// ChangePasswordRequest represents a password change request
type ChangePasswordRequest struct {
	CurrentPassword string `json:"currentPassword" binding:"required"`
	NewPassword     string `json:"newPassword" binding:"required,min=12"`
}

// ForgotPasswordRequest represents a forgot password request
type ForgotPasswordRequest struct {
	Email        string `json:"email" binding:"required,email"`
	CaptchaToken string `json:"captchaToken"`
}

// ResetPasswordRequest represents a password reset request
type ResetPasswordRequest struct {
	Token    string `json:"token" binding:"required"`
	Password string `json:"password" binding:"required,min=12"`
}

// CreateUserRequest represents a user creation request
type CreateUserRequest struct {
	Email     string      `json:"email" binding:"required,email"`
	FirstName string      `json:"firstName" binding:"required"`
	LastName  string      `json:"lastName" binding:"required"`
	Password  string      `json:"password" binding:"required,min=12"`
	RoleIDs   []uuid.UUID `json:"roleIds"`
}

// UpdateUserRequest represents a user update request
type UpdateUserRequest struct {
	FirstName string      `json:"firstName"`
	LastName  string      `json:"lastName"`
	IsActive  *bool       `json:"isActive"`
	RoleIDs   []uuid.UUID `json:"roleIds"`
}

// AuthResult represents a generic authentication result
type AuthResult struct {
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
	User    *User  `json:"user,omitempty"`
}

// SecurityContext represents the security context for a request
type SecurityContext struct {
	UserID                 uuid.UUID `json:"userId"`
	SessionID              string    `json:"sessionId"`
	CSRFToken              string    `json:"csrfToken"`
	LastActivity           time.Time `json:"lastActivity"`
	SessionExpiry          time.Time `json:"sessionExpiry"`
	RequiresPasswordChange bool      `json:"requiresPasswordChange"`
	RiskScore              int       `json:"riskScore"`
	Permissions            []string  `json:"permissions"`
	Roles                  []string  `json:"roles"`
}

// HasPermission checks if the security context has a specific permission
func (sc *SecurityContext) HasPermission(permission string) bool {
	for _, p := range sc.Permissions {
		if p == permission {
			return true
		}
	}
	return false
}

// HasRole checks if the security context has a specific role
func (sc *SecurityContext) HasRole(role string) bool {
	for _, r := range sc.Roles {
		if r == role {
			return true
		}
	}
	return false
}

// HasAnyRole checks if the security context has any of the specified roles
func (sc *SecurityContext) HasAnyRole(roles []string) bool {
	for _, role := range roles {
		if sc.HasRole(role) {
			return true
		}
	}
	return false
}

// HasAllPermissions checks if the security context has all specified permissions
func (sc *SecurityContext) HasAllPermissions(permissions []string) bool {
	for _, permission := range permissions {
		if !sc.HasPermission(permission) {
			return false
		}
	}
	return true
}

// CanAccess checks if the security context can access a resource with a specific action
func (sc *SecurityContext) CanAccess(resource, action string) bool {
	permission := resource + ":" + action
	return sc.HasPermission(permission)
}
