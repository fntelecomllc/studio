// Phase 6.2: Multi-Factor Authentication Service Implementation

package services

import (
	"crypto/rand"
	"encoding/base32"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/pquerna/otp"
	"github.com/pquerna/otp/totp"
)

// MFAService handles multi-factor authentication
type MFAService struct {
	issuer string
}

// NewMFAService creates a new MFA service
func NewMFAService(issuer string) *MFAService {
	return &MFAService{
		issuer: issuer,
	}
}

// TOTPSecret represents a TOTP secret for a user
type TOTPSecret struct {
	UserID      string    `json:"userId"`
	Secret      string    `json:"secret"`
	QRCode      string    `json:"qrCode"`
	BackupCodes []string  `json:"backupCodes"`
	CreatedAt   time.Time `json:"createdAt"`
}

// GenerateTOTPSecret generates a new TOTP secret for a user
func (s *MFAService) GenerateTOTPSecret(userID, userEmail string) (*TOTPSecret, error) {
	// Generate a new TOTP key
	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      s.issuer,
		AccountName: userEmail,
		SecretSize:  32,
		Algorithm:   otp.AlgorithmSHA256,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to generate TOTP key: %w", err)
	}

	// Generate backup codes
	backupCodes, err := s.generateBackupCodes(8)
	if err != nil {
		return nil, fmt.Errorf("failed to generate backup codes: %w", err)
	}

	return &TOTPSecret{
		UserID:      userID,
		Secret:      key.Secret(),
		QRCode:      key.URL(),
		BackupCodes: backupCodes,
		CreatedAt:   time.Now(),
	}, nil
}

// VerifyTOTP verifies a TOTP token
func (s *MFAService) VerifyTOTP(secret, token string) (bool, error) {
	return totp.Validate(token, secret), nil
}

// VerifyTOTPWithWindow verifies a TOTP token with a time window
func (s *MFAService) VerifyTOTPWithWindow(secret, token string, window int) (bool, error) {
	// Validate with custom window (number of 30-second periods)
	opts := totp.ValidateOpts{
		Period:    30,
		Skew:      uint(window),
		Digits:    otp.DigitsSix,
		Algorithm: otp.AlgorithmSHA256,
	}

	valid, err := totp.ValidateCustom(token, secret, time.Now(), opts)
	return valid, err
}

// generateBackupCodes generates a set of backup codes
func (s *MFAService) generateBackupCodes(count int) ([]string, error) {
	codes := make([]string, count)

	for i := 0; i < count; i++ {
		// Generate 6 random bytes
		bytes := make([]byte, 6)
		if _, err := rand.Read(bytes); err != nil {
			return nil, fmt.Errorf("failed to generate random bytes: %w", err)
		}

		// Convert to base32 and format as XXXX-XXXX
		code := base32.StdEncoding.EncodeToString(bytes)[:8]
		codes[i] = fmt.Sprintf("%s-%s", code[:4], code[4:])
	}

	return codes, nil
}

// HashBackupCode hashes a backup code for storage
func (s *MFAService) HashBackupCode(code string) string {
	// In production, use bcrypt or argon2
	// This is simplified for demonstration
	hash := make([]byte, 32)
	copy(hash, []byte(code))
	return hex.EncodeToString(hash)
}

// MFAMethod represents different MFA methods
type MFAMethod string

const (
	MFAMethodTOTP   MFAMethod = "totp"
	MFAMethodSMS    MFAMethod = "sms"
	MFAMethodEmail  MFAMethod = "email"
	MFAMethodBackup MFAMethod = "backup"
)

// MFAChallenge represents an MFA challenge
type MFAChallenge struct {
	ChallengeID string    `json:"challengeId"`
	UserID      string    `json:"userId"`
	Method      MFAMethod `json:"method"`
	CreatedAt   time.Time `json:"createdAt"`
	ExpiresAt   time.Time `json:"expiresAt"`
	Attempts    int       `json:"attempts"`
	MaxAttempts int       `json:"maxAttempts"`
}

// CreateMFAChallenge creates a new MFA challenge
func (s *MFAService) CreateMFAChallenge(userID string, method MFAMethod) (*MFAChallenge, error) {
	// Generate challenge ID
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return nil, fmt.Errorf("failed to generate challenge ID: %w", err)
	}

	return &MFAChallenge{
		ChallengeID: hex.EncodeToString(bytes),
		UserID:      userID,
		Method:      method,
		CreatedAt:   time.Now(),
		ExpiresAt:   time.Now().Add(5 * time.Minute),
		Attempts:    0,
		MaxAttempts: 3,
	}, nil
}

// ValidateChallenge checks if a challenge is still valid
func (s *MFAService) ValidateChallenge(challenge *MFAChallenge) error {
	if time.Now().After(challenge.ExpiresAt) {
		return fmt.Errorf("MFA challenge expired")
	}

	if challenge.Attempts >= challenge.MaxAttempts {
		return fmt.Errorf("maximum MFA attempts exceeded")
	}

	return nil
}

// MFAEnrollment represents a user's MFA enrollment status
type MFAEnrollment struct {
	UserID          string    `json:"userId"`
	TOTPEnabled     bool      `json:"totpEnabled"`
	TOTPSecret      string    `json:"-"` // Never expose
	BackupCodesUsed []string  `json:"-"` // Never expose
	PreferredMethod MFAMethod `json:"preferredMethod"`
	EnrolledAt      time.Time `json:"enrolledAt"`
	LastUsedAt      time.Time `json:"lastUsedAt"`
}

// EnrollTOTP enrolls a user in TOTP MFA
func (s *MFAService) EnrollTOTP(userID string, secret string) (*MFAEnrollment, error) {
	return &MFAEnrollment{
		UserID:          userID,
		TOTPEnabled:     true,
		TOTPSecret:      secret,
		PreferredMethod: MFAMethodTOTP,
		EnrolledAt:      time.Now(),
	}, nil
}

// RecoveryOptions represents MFA recovery options
type RecoveryOptions struct {
	BackupCodesRemaining int         `json:"backupCodesRemaining"`
	AlternativeMethods   []MFAMethod `json:"alternativeMethods"`
	RecoveryEmail        string      `json:"recoveryEmail,omitempty"`
	RecoveryPhone        string      `json:"recoveryPhone,omitempty"`
}

// GetRecoveryOptions returns available recovery options for a user
func (s *MFAService) GetRecoveryOptions(enrollment *MFAEnrollment) *RecoveryOptions {
	options := &RecoveryOptions{
		BackupCodesRemaining: 8 - len(enrollment.BackupCodesUsed),
		AlternativeMethods:   []MFAMethod{},
	}

	// Add available alternative methods
	if enrollment.TOTPEnabled {
		options.AlternativeMethods = append(options.AlternativeMethods, MFAMethodBackup)
	}

	return options
}
