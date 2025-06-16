package websocket

// SecurityContext represents the authenticated user context for a WebSocket connection
type SecurityContext struct {
	UserID      string
	SessionID   string
	ClientIP    string
	Permissions []string
}

// HasPermission checks if the user has a specific permission
func (sc *SecurityContext) HasPermission(permission string) bool {
	for _, p := range sc.Permissions {
		if p == permission {
			return true
		}
	}
	return false
}
