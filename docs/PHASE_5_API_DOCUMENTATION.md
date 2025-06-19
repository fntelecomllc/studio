# DomainFlow Phase 5 API Documentation

## Overview
This document covers the new API services and monitoring features implemented in Phase 5 of the DomainFlow architectural remediation.

## Campaign Control API

### Campaign Service Extensions
The `campaignService.production.ts` has been extended with campaign control operations.

#### Start Campaign
```typescript
async startCampaign(campaignId: string): Promise<CampaignOperationResponse>
```
**Description**: Starts a campaign that is in a ready or paused state.
**Parameters**:
- `campaignId` (string): Unique identifier for the campaign
**Returns**: Promise resolving to campaign response with updated status
**Backend Endpoint**: `POST /api/v2/campaigns/{campaignId}/start`
**Required Permission**: `campaigns:execute`

#### Pause Campaign
```typescript
async pauseCampaign(campaignId: string): Promise<CampaignOperationResponse>
```
**Description**: Pauses a running campaign, preserving current state.
**Parameters**:
- `campaignId` (string): Unique identifier for the campaign
**Returns**: Promise resolving to campaign response with updated status
**Backend Endpoint**: `POST /api/v2/campaigns/{campaignId}/pause`
**Required Permission**: `campaigns:execute`

#### Resume Campaign
```typescript
async resumeCampaign(campaignId: string): Promise<CampaignOperationResponse>
```
**Description**: Resumes a paused campaign from its last state.
**Parameters**:
- `campaignId` (string): Unique identifier for the campaign
**Returns**: Promise resolving to campaign response with updated status
**Backend Endpoint**: `POST /api/v2/campaigns/{campaignId}/resume`
**Required Permission**: `campaigns:execute`

#### Cancel Campaign
```typescript
async cancelCampaign(campaignId: string): Promise<CampaignOperationResponse>
```
**Description**: Cancels a campaign permanently. Cannot be resumed.
**Parameters**:
- `campaignId` (string): Unique identifier for the campaign
**Returns**: Promise resolving to campaign response with updated status
**Backend Endpoint**: `POST /api/v2/campaigns/{campaignId}/cancel`
**Required Permission**: `campaigns:execute`

## Admin User Management API

### Admin Service
The `adminService.production.ts` provides comprehensive user management capabilities.

#### Get Users
```typescript
async getUsers(filters?: UserListFilters): Promise<UserListResponse>
```
**Description**: Retrieves a paginated list of users with optional filtering.
**Parameters**:
- `filters` (optional): Object containing filter criteria
  - `isActive?: boolean` - Filter by active status
  - `isLocked?: boolean` - Filter by locked status
  - `role?: string` - Filter by user role
  - `search?: string` - Search in name/email
  - `limit?: number` - Maximum results per page
  - `offset?: number` - Results offset for pagination
**Returns**: Promise resolving to user list response
**Backend Endpoint**: `GET /api/v2/admin/users`
**Required Permission**: `admin:users`

#### Get User by ID
```typescript
async getUserById(userId: string): Promise<UserDetailResponse>
```
**Description**: Retrieves detailed information for a specific user.
**Parameters**:
- `userId` (string): Unique identifier for the user
**Returns**: Promise resolving to user detail response
**Backend Endpoint**: `GET /api/v2/admin/users/{userId}`
**Required Permission**: `admin:users`

#### Create User
```typescript
async createUser(userData: CreateUserRequest): Promise<UserCreateResponse>
```
**Description**: Creates a new user account.
**Parameters**:
- `userData` (CreateUserRequest): User creation data
  - `email: string` - User email (required)
  - `firstName?: string` - User first name
  - `lastName?: string` - User last name
  - `name?: string` - Full display name
  - `roles?: string[]` - Initial user roles
  - `permissions?: string[]` - Initial permissions
  - `isActive?: boolean` - Account active status
  - `mustChangePassword?: boolean` - Force password change on login
**Returns**: Promise resolving to user creation response
**Backend Endpoint**: `POST /api/v2/admin/users`
**Required Permission**: `admin:users`

#### Update User
```typescript
async updateUser(userId: string, userData: UpdateUserRequest): Promise<UserUpdateResponse>
```
**Description**: Updates an existing user account.
**Parameters**:
- `userId` (string): Unique identifier for the user
- `userData` (UpdateUserRequest): User update data (all fields optional)
**Returns**: Promise resolving to user update response
**Backend Endpoint**: `PUT /api/v2/admin/users/{userId}`
**Required Permission**: `admin:users`

#### Delete User
```typescript
async deleteUser(userId: string): Promise<UserDeleteResponse>
```
**Description**: Permanently deletes a user account.
**Parameters**:
- `userId` (string): Unique identifier for the user
**Returns**: Promise resolving to deletion confirmation
**Backend Endpoint**: `DELETE /api/v2/admin/users/{userId}`
**Required Permission**: `admin:users`

#### User Control Methods
Additional convenience methods for common user management operations:
- `activateUser(userId: string)` - Sets user as active
- `deactivateUser(userId: string)` - Sets user as inactive
- `lockUser(userId: string)` - Locks user account
- `unlockUser(userId: string)` - Unlocks user account
- `updateUserRoles(userId: string, roles: string[])` - Updates user roles
- `updateUserPermissions(userId: string, permissions: string[])` - Updates user permissions

## Performance Monitoring API

### Performance Monitor
Core monitoring service for collecting performance metrics.

#### Record Custom Metric
```typescript
recordCustomMetric(name: string, value: number, unit: 'ms' | 'bytes' | 'count' | 'percent', tags?: Record<string, string>): void
```
**Description**: Records a custom performance metric.
**Parameters**:
- `name` (string): Metric name
- `value` (number): Metric value
- `unit` (string): Unit of measurement
- `tags` (optional): Additional metadata tags

#### Record API Call
```typescript
recordApiCall(url: string, method: string, duration: number, status: number): void
```
**Description**: Records API call performance metrics.
**Parameters**:
- `url` (string): API endpoint URL
- `method` (string): HTTP method
- `duration` (number): Request duration in milliseconds
- `status` (number): HTTP status code

### Monitoring Service
Integrated monitoring service with React hooks.

#### Campaign Monitoring
```typescript
recordCampaignOperation(operation: 'create' | 'start' | 'pause' | 'resume' | 'cancel', campaignId: string, duration: number): void
recordCampaignMetric(campaignId: string, metric: string, value: number, unit: PerformanceMetric['unit']): void
```

#### Error Tracking
```typescript
recordError(error: Error, context?: string): void
```

#### User Interaction Tracking
```typescript
recordUserInteraction(type: 'click' | 'input' | 'scroll' | 'navigation', element: string, metadata?: Record<string, string>): void
```

## React Hooks API

### useMonitoring Hook
Primary hook for component-level monitoring.

```typescript
const {
  trackClick,
  trackInput,
  trackNavigation,
  recordMetric,
  recordError,
  createTimer,
  renderCount
} = useMonitoring({
  componentName: 'MyComponent',
  trackRenders: true,
  trackMounts: true,
  trackInteractions: true
});
```

### useCampaignMonitoring Hook
Specialized hook for campaign operations.

```typescript
const {
  recordCampaignOperation,
  recordCampaignMetric
} = useCampaignMonitoring(campaignId);
```

### useApiMonitoring Hook
Hook for automatic API call tracking.

```typescript
const { trackApiCall } = useApiMonitoring();

// Usage
const result = await trackApiCall(
  () => api.getCampaigns(),
  '/api/v2/campaigns',
  'GET'
);
```

## Validation API

### Runtime Validators
Comprehensive validation functions for data integrity.

#### validateUUID
```typescript
validateUUID(value: unknown): value is string
```
**Description**: Validates UUID format (v4).

#### validateSafeBigInt
```typescript
validateSafeBigInt(value: unknown): value is SafeBigInt
```
**Description**: Validates SafeBigInt values and range.

#### validateEmail
```typescript
validateEmail(value: unknown): value is string
```
**Description**: Validates email format.

#### validatePermissions
```typescript
validatePermissions(permissions: unknown): permissions is string[]
```
**Description**: Validates permission arrays.

### API Client Wrapper
Automatic validation wrapper for API responses.

```typescript
import { apiClientWrapper } from '@/lib/api/api-client-wrapper';

// Automatically validates responses
const response = await apiClientWrapper.get('/api/v2/campaigns');
```

## Permission System API

### WithPermission Component
Component guard for permission-based rendering.

```typescript
<WithPermission 
  permissions={['campaigns:read']}
  roles={['admin']}
  requireAll={false}
  fallback={<AccessDenied />}
>
  <CampaignList />
</WithPermission>
```

### usePermissions Hook
Enhanced permission checking with caching.

```typescript
const {
  hasPermission,
  hasRole,
  hasAnyPermission,
  hasAllPermissions,
  isLoading,
  error
} = usePermissions({
  enableCaching: true,
  cacheTimeout: 300000 // 5 minutes
});
```

## Configuration

### Monitoring Configuration
Environment-specific monitoring settings.

```typescript
// Development
{
  enabled: true,
  samplingRate: 1.0, // 100% sampling
  bufferSize: 10,
  flushInterval: 5000, // 5 seconds
  enabledMetrics: { /* all enabled */ }
}

// Production
{
  enabled: true,
  samplingRate: 0.1, // 10% sampling
  bufferSize: 50,
  flushInterval: 30000, // 30 seconds
  endpoint: '/api/v2/monitoring/metrics'
}
```

### Performance Thresholds
Predefined thresholds for performance alerting.

```typescript
export const PERFORMANCE_THRESHOLDS = {
  FCP_GOOD: 1800,     // First Contentful Paint
  LCP_GOOD: 2500,     // Largest Contentful Paint
  FID_GOOD: 100,      // First Input Delay
  CLS_GOOD: 0.1,      // Cumulative Layout Shift
  API_RESPONSE_GOOD: 1000,
  COMPONENT_RENDER_GOOD: 16,
  MEMORY_USAGE_WARNING: 100 * 1024 * 1024 // 100MB
};
```

## Error Handling

All API methods follow consistent error handling patterns:
- Methods throw errors for network/validation failures
- Response objects contain status/error information
- Monitoring automatically tracks API errors
- Permission errors are handled gracefully with fallbacks

## Security Considerations

- All admin operations require `admin:users` permission
- Campaign controls require `campaigns:execute` permission
- API calls are automatically monitored for security events
- Input validation prevents XSS and injection attacks
- Permission caching includes security considerations
