// File: backend/internal/api/user_handlers.go
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
)

// --- DTOs for User Management API ---

type ListUsersResponse struct {
	Users      []UserResponse             `json:"users"`
	Pagination PaginationResponse         `json:"pagination"`
}

type UserResponse struct {
	ID                  uuid.UUID  `json:"id"`
	Email               string     `json:"email"`
	EmailVerified       bool       `json:"emailVerified"`
	FirstName           string     `json:"firstName"`
	LastName            string     `json:"lastName"`
	AvatarURL           *string    `json:"avatarUrl,omitempty"`
	IsActive            bool       `json:"isActive"`
	IsLocked            bool       `json:"isLocked"`
	FailedLoginAttempts int        `json:"failedLoginAttempts"`
	LastLoginAt         *time.Time `json:"lastLoginAt,omitempty"`
	MFAEnabled          bool       `json:"mfaEnabled"`
	CreatedAt           time.Time  `json:"createdAt"`
	UpdatedAt           time.Time  `json:"updatedAt"`
	Roles               []string   `json:"roles,omitempty"`
}

type PaginationResponse struct {
	Page       int `json:"page"`
	Limit      int `json:"limit"`
	Total      int `json:"total"`
	TotalPages int `json:"totalPages"`
}

func toUserResponse(u *models.User) UserResponse {
	response := UserResponse{
		ID:                  u.ID,
		Email:               u.Email,
		EmailVerified:       u.EmailVerified,
		FirstName:           u.FirstName,
		LastName:            u.LastName,
		AvatarURL:           u.AvatarURL,
		IsActive:            u.IsActive,
		IsLocked:            u.IsLocked,
		FailedLoginAttempts: u.FailedLoginAttempts,
		LastLoginAt:         u.LastLoginAt,
		MFAEnabled:          u.MFAEnabled,
		CreatedAt:           u.CreatedAt,
		UpdatedAt:           u.UpdatedAt,
	}

	// Convert roles to string array
	if u.Roles != nil {
		response.Roles = make([]string, len(u.Roles))
		for i, role := range u.Roles {
			response.Roles[i] = role.Name
		}
	}

	return response
}

// --- Gin Handlers for User Management ---

// ListUsersGin handles GET /api/v2/admin/users
func (h *APIHandler) ListUsersGin(c *gin.Context) {
	log.Printf("[ListUsersGin] Listing users")

	// Get pagination parameters
	page := 1
	limit := 10

	if pageStr := c.Query("page"); pageStr != "" {
		if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
			page = p
		}
	}

	if limitStr := c.Query("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 100 {
			limit = l
		}
	}

	offset := (page - 1) * limit

	// Query users from database
	query := `
		SELECT u.id, u.email, u.email_verified, u.first_name, u.last_name, u.avatar_url,
		       u.is_active, u.is_locked, u.failed_login_attempts, u.last_login_at,
		       u.mfa_enabled, u.created_at, u.updated_at
		FROM auth.users u
		ORDER BY u.created_at DESC
		LIMIT $1 OFFSET $2`

	rows, err := h.DB.Query(query, limit, offset)
	if err != nil {
		log.Printf("[ListUsersGin] Error querying users: %v", err)
		respondWithErrorGin(c, http.StatusInternalServerError, "Failed to fetch users")
		return
	}
	defer rows.Close()

	var users []models.User
	for rows.Next() {
		var user models.User
		var lastLoginAt sql.NullTime

		err := rows.Scan(
			&user.ID, &user.Email, &user.EmailVerified, &user.FirstName, &user.LastName,
			&user.AvatarURL, &user.IsActive, &user.IsLocked, &user.FailedLoginAttempts,
			&lastLoginAt, &user.MFAEnabled, &user.CreatedAt, &user.UpdatedAt,
		)
		if err != nil {
			log.Printf("[ListUsersGin] Error scanning user: %v", err)
			respondWithErrorGin(c, http.StatusInternalServerError, "Failed to scan user data")
			return
		}

		if lastLoginAt.Valid {
			user.LastLoginAt = &lastLoginAt.Time
		}

		// Get user roles
		rolesQuery := `
			SELECT r.name
			FROM auth.roles r
			JOIN auth.user_roles ur ON r.id = ur.role_id
			WHERE ur.user_id = $1 AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`
		
		var roleNames []string
		err = h.DB.Select(&roleNames, rolesQuery, user.ID)
		if err != nil {
			log.Printf("[ListUsersGin] Error fetching roles for user %s: %v", user.ID, err)
			// Continue without roles rather than failing the entire request
		} else {
			user.Roles = make([]models.Role, len(roleNames))
			for i, name := range roleNames {
				user.Roles[i] = models.Role{Name: name}
			}
		}

		users = append(users, user)
	}

	// Get total count
	var totalCount int
	err = h.DB.Get(&totalCount, "SELECT COUNT(*) FROM auth.users")
	if err != nil {
		log.Printf("[ListUsersGin] Error getting user count: %v", err)
		respondWithErrorGin(c, http.StatusInternalServerError, "Failed to get user count")
		return
	}

	// Convert to response format
	userResponses := make([]UserResponse, len(users))
	for i, user := range users {
		userResponses[i] = toUserResponse(&user)
	}

	response := ListUsersResponse{
		Users: userResponses,
		Pagination: PaginationResponse{
			Page:       page,
			Limit:      limit,
			Total:      totalCount,
			TotalPages: (totalCount + limit - 1) / limit,
		},
	}

	log.Printf("[ListUsersGin] Successfully listed %d users", len(users))
	respondWithJSONGin(c, http.StatusOK, response)
}

// CreateUserGin handles POST /api/v2/admin/users
func (h *APIHandler) CreateUserGin(c *gin.Context) {
	log.Printf("[CreateUserGin] Creating new user")

	var req models.CreateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("[CreateUserGin] Error binding JSON: %v", err)
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid request payload: "+err.Error())
		return
	}

	if err := validate.Struct(req); err != nil {
		log.Printf("[CreateUserGin] Validation failed: %v", err)
		respondWithErrorGin(c, http.StatusBadRequest, "Validation failed: "+err.Error())
		return
	}

	// Hash the password with pgcrypto-compatible format
	passwordQuery := `SELECT crypt($1, gen_salt('bf')) AS password_hash`
	var passwordHash string
	err := h.DB.Get(&passwordHash, passwordQuery, req.Password)
	if err != nil {
		log.Printf("[CreateUserGin] Error hashing password: %v", err)
		respondWithErrorGin(c, http.StatusInternalServerError, "Failed to process password")
		return
	}

	var opErr error
	isSQL := h.DB != nil

	if isSQL {
		sqlTx, startTxErr := h.DB.BeginTxx(c.Request.Context(), nil)
		if startTxErr != nil {
			log.Printf("[CreateUserGin] Error beginning SQL transaction: %v", startTxErr)
			respondWithErrorGin(c, http.StatusInternalServerError, "Failed to start SQL transaction")
			return
		}

		defer func() {
			if p := recover(); p != nil {
				log.Printf("[CreateUserGin] Panic recovered during SQL user creation, rolling back: %v", p)
				sqlTx.Rollback()
				panic(p)
			} else if opErr != nil {
				log.Printf("[CreateUserGin] Error occurred (SQL), rolling back: %v", opErr)
				sqlTx.Rollback()
			} else {
				if commitErr := sqlTx.Commit(); commitErr != nil {
					log.Printf("[CreateUserGin] Error committing SQL transaction: %v", commitErr)
				} else {
					log.Printf("[CreateUserGin] SQL Transaction committed")
				}
			}
		}()

		// Create user in transaction
		userID := uuid.New()
		now := time.Now()
		createQuery := `
			INSERT INTO auth.users (
				id, email, email_verified, password_hash, password_pepper_version,
				first_name, last_name, is_active, is_locked, failed_login_attempts,
				password_changed_at, must_change_password, mfa_enabled, created_at, updated_at
			) VALUES (
				$1, $2, false, $3, 1, $4, $5, true, false, 0, $6, false, false, $6, $6
			)`

		_, err = sqlTx.Exec(createQuery, userID, req.Email, passwordHash, req.FirstName, req.LastName, now)
		if err != nil {
			opErr = err
			if err.Error() == `pq: duplicate key value violates unique constraint "users_email_key"` {
				respondWithErrorGin(c, http.StatusConflict, "User with this email already exists")
			} else {
				log.Printf("[CreateUserGin] Error creating user: %v", err)
				respondWithErrorGin(c, http.StatusInternalServerError, "Failed to create user")
			}
			return
		}

		// Assign roles if provided
		if len(req.RoleIDs) > 0 {
			for _, roleID := range req.RoleIDs {
				roleQuery := `INSERT INTO auth.user_roles (user_id, role_id, assigned_at) VALUES ($1, $2, $3)`
				_, err = sqlTx.Exec(roleQuery, userID, roleID, now)
				if err != nil {
					opErr = err
					log.Printf("[CreateUserGin] Error assigning role %s to user: %v", roleID, err)
					respondWithErrorGin(c, http.StatusInternalServerError, "Failed to assign user roles")
					return
				}
			}
		}

		// Create audit log
		auditLog := &models.AuditLog{
			UserID:     uuid.NullUUID{}, // TODO: Get from security context
			Action:     "Create User",
			EntityType: sql.NullString{String: "User", Valid: true},
			EntityID:   uuid.NullUUID{UUID: userID, Valid: true},
			Details:    models.JSONRawMessagePtr(json.RawMessage(fmt.Sprintf(`{"email":"%s"}`, req.Email))),
		}
		if err := h.AuditLogStore.CreateAuditLog(c.Request.Context(), sqlTx, auditLog); err != nil {
			opErr = err
			log.Printf("[CreateUserGin] Error creating audit log: %v", err)
			respondWithErrorGin(c, http.StatusInternalServerError, "Failed to create user (audit log error)")
			return
		}

		// Return created user
		user := models.User{
			ID:            userID,
			Email:         req.Email,
			EmailVerified: false,
			FirstName:     req.FirstName,
			LastName:      req.LastName,
			IsActive:      true,
			IsLocked:      false,
			MFAEnabled:    false,
			CreatedAt:     now,
			UpdatedAt:     now,
		}

		log.Printf("[CreateUserGin] Successfully created user %s", userID)
		respondWithJSONGin(c, http.StatusCreated, toUserResponse(&user))
	}
}

// GetUserGin handles GET /api/v2/admin/users/:userId
func (h *APIHandler) GetUserGin(c *gin.Context) {
	userIDStr := c.Param("userId")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid user ID format")
		return
	}

	log.Printf("[GetUserGin] Getting user %s", userID)

	// Query user from database
	query := `
		SELECT u.id, u.email, u.email_verified, u.first_name, u.last_name, u.avatar_url,
		       u.is_active, u.is_locked, u.failed_login_attempts, u.last_login_at,
		       u.mfa_enabled, u.created_at, u.updated_at
		FROM auth.users u
		WHERE u.id = $1`

	var user models.User
	var lastLoginAt sql.NullTime

	err = h.DB.QueryRow(query, userID).Scan(
		&user.ID, &user.Email, &user.EmailVerified, &user.FirstName, &user.LastName,
		&user.AvatarURL, &user.IsActive, &user.IsLocked, &user.FailedLoginAttempts,
		&lastLoginAt, &user.MFAEnabled, &user.CreatedAt, &user.UpdatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			respondWithErrorGin(c, http.StatusNotFound, "User not found")
			return
		}
		log.Printf("[GetUserGin] Error fetching user: %v", err)
		respondWithErrorGin(c, http.StatusInternalServerError, "Failed to fetch user")
		return
	}

	if lastLoginAt.Valid {
		user.LastLoginAt = &lastLoginAt.Time
	}

	// Get user roles
	rolesQuery := `
		SELECT r.name
		FROM auth.roles r
		JOIN auth.user_roles ur ON r.id = ur.role_id
		WHERE ur.user_id = $1 AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`
	
	var roleNames []string
	err = h.DB.Select(&roleNames, rolesQuery, user.ID)
	if err != nil {
		log.Printf("[GetUserGin] Error fetching roles: %v", err)
		// Continue without roles
	} else {
		user.Roles = make([]models.Role, len(roleNames))
		for i, name := range roleNames {
			user.Roles[i] = models.Role{Name: name}
		}
	}

	log.Printf("[GetUserGin] Successfully fetched user %s", userID)
	respondWithJSONGin(c, http.StatusOK, toUserResponse(&user))
}

// UpdateUserGin handles PUT /api/v2/admin/users/:userId
func (h *APIHandler) UpdateUserGin(c *gin.Context) {
	userIDStr := c.Param("userId")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid user ID format")
		return
	}

	log.Printf("[UpdateUserGin] Updating user %s", userID)

	var req models.UpdateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid request payload: "+err.Error())
		return
	}

	if err := validate.Struct(req); err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Validation failed: "+err.Error())
		return
	}

	var opErr error
	isSQL := h.DB != nil

	if isSQL {
		sqlTx, startTxErr := h.DB.BeginTxx(c.Request.Context(), nil)
		if startTxErr != nil {
			log.Printf("[UpdateUserGin] Error beginning SQL transaction: %v", startTxErr)
			respondWithErrorGin(c, http.StatusInternalServerError, "Failed to start SQL transaction")
			return
		}

		defer func() {
			if p := recover(); p != nil {
				log.Printf("[UpdateUserGin] Panic recovered, rolling back: %v", p)
				sqlTx.Rollback()
				panic(p)
			} else if opErr != nil {
				log.Printf("[UpdateUserGin] Error occurred, rolling back: %v", opErr)
				sqlTx.Rollback()
			} else {
				if commitErr := sqlTx.Commit(); commitErr != nil {
					log.Printf("[UpdateUserGin] Error committing transaction: %v", commitErr)
				} else {
					log.Printf("[UpdateUserGin] Transaction committed")
				}
			}
		}()

		// Check if user exists
		var exists bool
		err = sqlTx.Get(&exists, "SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = $1)", userID)
		if err != nil {
			opErr = err
			log.Printf("[UpdateUserGin] Error checking user existence: %v", err)
			respondWithErrorGin(c, http.StatusInternalServerError, "Failed to check user")
			return
		}

		if !exists {
			opErr = store.ErrNotFound
			respondWithErrorGin(c, http.StatusNotFound, "User not found")
			return
		}

		// Build dynamic update query
		setParts := []string{}
		args := []interface{}{}
		argIndex := 1

		if req.FirstName != "" {
			setParts = append(setParts, fmt.Sprintf("first_name = $%d", argIndex))
			args = append(args, req.FirstName)
			argIndex++
		}

		if req.LastName != "" {
			setParts = append(setParts, fmt.Sprintf("last_name = $%d", argIndex))
			args = append(args, req.LastName)
			argIndex++
		}

		if req.IsActive != nil {
			setParts = append(setParts, fmt.Sprintf("is_active = $%d", argIndex))
			args = append(args, *req.IsActive)
			argIndex++
		}

		if len(setParts) == 0 && len(req.RoleIDs) == 0 {
			respondWithErrorGin(c, http.StatusBadRequest, "No fields to update")
			return
		}

		// Update user fields if any
		if len(setParts) > 0 {
			setParts = append(setParts, fmt.Sprintf("updated_at = $%d", argIndex))
			args = append(args, time.Now())
			argIndex++

			args = append(args, userID)
			updateQuery := fmt.Sprintf(
				"UPDATE auth.users SET %s WHERE id = $%d",
				sql.NullString{}.String+setParts[0], argIndex,
			)

			for i := 1; i < len(setParts); i++ {
				updateQuery = fmt.Sprintf(
					"UPDATE auth.users SET %s, %s WHERE id = $%d",
					updateQuery[:len(updateQuery)-len(fmt.Sprintf(" WHERE id = $%d", argIndex))],
					setParts[i], argIndex,
				)
			}

			_, err = sqlTx.Exec(updateQuery, args...)
			if err != nil {
				opErr = err
				log.Printf("[UpdateUserGin] Error updating user: %v", err)
				respondWithErrorGin(c, http.StatusInternalServerError, "Failed to update user")
				return
			}
		}

		// Update roles if provided
		if len(req.RoleIDs) > 0 {
			// Remove existing roles
			_, err = sqlTx.Exec("DELETE FROM auth.user_roles WHERE user_id = $1", userID)
			if err != nil {
				opErr = err
				log.Printf("[UpdateUserGin] Error removing existing roles: %v", err)
				respondWithErrorGin(c, http.StatusInternalServerError, "Failed to update user roles")
				return
			}

			// Add new roles
			now := time.Now()
			for _, roleID := range req.RoleIDs {
				roleQuery := `INSERT INTO auth.user_roles (user_id, role_id, assigned_at) VALUES ($1, $2, $3)`
				_, err = sqlTx.Exec(roleQuery, userID, roleID, now)
				if err != nil {
					opErr = err
					log.Printf("[UpdateUserGin] Error assigning role %s: %v", roleID, err)
					respondWithErrorGin(c, http.StatusInternalServerError, "Failed to assign user roles")
					return
				}
			}
		}

		// Create audit log
		auditLog := &models.AuditLog{
			UserID:     uuid.NullUUID{}, // TODO: Get from security context
			Action:     "Update User",
			EntityType: sql.NullString{String: "User", Valid: true},
			EntityID:   uuid.NullUUID{UUID: userID, Valid: true},
		}
		if err := h.AuditLogStore.CreateAuditLog(c.Request.Context(), sqlTx, auditLog); err != nil {
			opErr = err
			log.Printf("[UpdateUserGin] Error creating audit log: %v", err)
			respondWithErrorGin(c, http.StatusInternalServerError, "Failed to update user (audit log error)")
			return
		}

		// Fetch updated user
		var user models.User
		var lastLoginAt sql.NullTime
		
		selectQuery := `
			SELECT u.id, u.email, u.email_verified, u.first_name, u.last_name, u.avatar_url,
			       u.is_active, u.is_locked, u.failed_login_attempts, u.last_login_at,
			       u.mfa_enabled, u.created_at, u.updated_at
			FROM auth.users u
			WHERE u.id = $1`

		err = sqlTx.QueryRow(selectQuery, userID).Scan(
			&user.ID, &user.Email, &user.EmailVerified, &user.FirstName, &user.LastName,
			&user.AvatarURL, &user.IsActive, &user.IsLocked, &user.FailedLoginAttempts,
			&lastLoginAt, &user.MFAEnabled, &user.CreatedAt, &user.UpdatedAt,
		)
		if err != nil {
			opErr = err
			log.Printf("[UpdateUserGin] Error fetching updated user: %v", err)
			respondWithErrorGin(c, http.StatusInternalServerError, "Failed to fetch updated user")
			return
		}

		if lastLoginAt.Valid {
			user.LastLoginAt = &lastLoginAt.Time
		}

		log.Printf("[UpdateUserGin] Successfully updated user %s", userID)
		respondWithJSONGin(c, http.StatusOK, toUserResponse(&user))
	}
}

// DeleteUserGin handles DELETE /api/v2/admin/users/:userId
func (h *APIHandler) DeleteUserGin(c *gin.Context) {
	userIDStr := c.Param("userId")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid user ID format")
		return
	}

	log.Printf("[DeleteUserGin] Deleting user %s", userID)

	var opErr error
	isSQL := h.DB != nil

	if isSQL {
		sqlTx, startTxErr := h.DB.BeginTxx(c.Request.Context(), nil)
		if startTxErr != nil {
			log.Printf("[DeleteUserGin] Error beginning SQL transaction: %v", startTxErr)
			respondWithErrorGin(c, http.StatusInternalServerError, "Failed to start SQL transaction")
			return
		}

		defer func() {
			if p := recover(); p != nil {
				log.Printf("[DeleteUserGin] Panic recovered, rolling back: %v", p)
				sqlTx.Rollback()
				panic(p)
			} else if opErr != nil {
				log.Printf("[DeleteUserGin] Error occurred, rolling back: %v", opErr)
				sqlTx.Rollback()
			} else {
				if commitErr := sqlTx.Commit(); commitErr != nil {
					log.Printf("[DeleteUserGin] Error committing transaction: %v", commitErr)
				} else {
					log.Printf("[DeleteUserGin] Transaction committed")
				}
			}
		}()

		// Check if user exists
		var exists bool
		err = sqlTx.Get(&exists, "SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = $1)", userID)
		if err != nil {
			opErr = err
			log.Printf("[DeleteUserGin] Error checking user existence: %v", err)
			respondWithErrorGin(c, http.StatusInternalServerError, "Failed to check user")
			return
		}

		if !exists {
			opErr = store.ErrNotFound
			respondWithErrorGin(c, http.StatusNotFound, "User not found")
			return
		}

		// Delete user (cascade will handle related records)
		_, err = sqlTx.Exec("DELETE FROM auth.users WHERE id = $1", userID)
		if err != nil {
			opErr = err
			log.Printf("[DeleteUserGin] Error deleting user: %v", err)
			respondWithErrorGin(c, http.StatusInternalServerError, "Failed to delete user")
			return
		}

		// Create audit log
		auditLog := &models.AuditLog{
			UserID:     uuid.NullUUID{}, // TODO: Get from security context
			Action:     "Delete User",
			EntityType: sql.NullString{String: "User", Valid: true},
			EntityID:   uuid.NullUUID{UUID: userID, Valid: true},
		}
		if err := h.AuditLogStore.CreateAuditLog(c.Request.Context(), sqlTx, auditLog); err != nil {
			opErr = err
			log.Printf("[DeleteUserGin] Error creating audit log: %v", err)
			respondWithErrorGin(c, http.StatusInternalServerError, "Failed to delete user (audit log error)")
			return
		}

		log.Printf("[DeleteUserGin] Successfully deleted user %s", userID)
		c.Status(http.StatusNoContent)
	}
}