# Phase 5 Component Documentation

## Overview
This document provides comprehensive documentation for all new components introduced in Phase 5 of the DomainFlow architectural remediation.

## Permission Components

### WithPermission Component
A flexible permission guard component that conditionally renders content based on user permissions and roles.

#### Props
```typescript
interface WithPermissionProps {
  permissions?: string[];           // Required permissions
  roles?: string[];                // Required roles  
  requireAll?: boolean;            // true: require ALL permissions/roles, false: require ANY
  children: React.ReactNode;       // Content to render when authorized
  fallback?: React.ReactNode;      // Content to render when unauthorized
  onUnauthorized?: () => void;     // Callback when unauthorized
  loadingComponent?: React.ReactNode; // Component to show while loading
}
```

#### Usage Examples
```typescript
// Basic permission check
<WithPermission permissions={['campaigns:read']}>
  <CampaignList />
</WithPermission>

// Multiple permissions (ANY)
<WithPermission 
  permissions={['campaigns:read', 'campaigns:write']}
  requireAll={false}
>
  <CampaignActions />
</WithPermission>

// Role-based access with fallback
<WithPermission 
  roles={['admin', 'manager']}
  fallback={<AccessDeniedMessage />}
>
  <AdminPanel />
</WithPermission>

// Complex permission logic
<WithPermission 
  permissions={['users:write']}
  roles={['admin']}
  requireAll={true}
  onUnauthorized={() => showAccessDeniedToast()}
>
  <UserManagement />
</WithPermission>
```

#### Features
- ✅ Automatic permission caching
- ✅ Loading state handling
- ✅ Flexible permission strategies
- ✅ Custom unauthorized callbacks
- ✅ TypeScript support

## BigInt Components

### BigIntDisplay Component
A specialized display component for safely rendering large integer values with various formatting options.

#### Props
```typescript
interface BigIntDisplayProps {
  value: SafeBigInt | bigint | number;
  format?: 'decimal' | 'abbreviated' | 'bytes';
  precision?: number;               // Decimal places for abbreviated format
  className?: string;               // CSS classes
  title?: string;                  // Tooltip text
  showTooltip?: boolean;           // Show full value in tooltip
}
```

#### Usage Examples
```typescript
// Basic decimal display
<BigIntDisplay value={1234567890n} />
// Output: "1,234,567,890"

// Abbreviated format
<BigIntDisplay 
  value={1500000000n} 
  format="abbreviated" 
  precision={1}
/>
// Output: "1.5B"

// Bytes format
<BigIntDisplay 
  value={1073741824n} 
  format="bytes"
/>
// Output: "1.0 GB"

// With custom styling
<BigIntDisplay 
  value={campaignStats.totalDomains}
  format="abbreviated"
  className="text-2xl font-bold text-blue-600"
  showTooltip={true}
/>
```

#### Formatting Options
- **decimal**: Standard number formatting with commas (1,234,567)
- **abbreviated**: K/M/B/T suffixes (1.5M, 2.3B)
- **bytes**: B/KB/MB/GB/TB suffixes (1.5 GB)

### BigIntInput Component
A controlled input component for safe entry and validation of large integer values.

#### Props
```typescript
interface BigIntInputProps {
  value: SafeBigInt | null;
  onChange: (value: SafeBigInt | null) => void;
  min?: SafeBigInt;                // Minimum value
  max?: SafeBigInt;                // Maximum value
  placeholder?: string;            // Placeholder text
  disabled?: boolean;              // Disabled state
  className?: string;              // CSS classes
  error?: string;                  // Error message
  showValidation?: boolean;        // Show validation feedback
}
```

#### Usage Examples
```typescript
// Basic usage
const [domains, setDomains] = useState<SafeBigInt | null>(null);

<BigIntInput
  value={domains}
  onChange={setDomains}
  placeholder="Enter number of domains"
/>

// With validation
<BigIntInput
  value={campaignLimit}
  onChange={setCampaignLimit}
  min={createSafeBigInt(1)}
  max={createSafeBigInt(1000000)}
  error={validationError}
  showValidation={true}
/>

// Styled input
<BigIntInput
  value={budget}
  onChange={setBudget}
  className="w-full p-3 border-2 border-gray-300 rounded-lg"
  placeholder="Campaign budget"
/>
```

#### Features
- ✅ Automatic BigInt validation
- ✅ Range checking (min/max)
- ✅ Input sanitization
- ✅ Error state display
- ✅ Accessible form integration

### CampaignStats Component
Enhanced campaign statistics display with SafeBigInt formatting and real-time updates.

#### Props
```typescript
interface CampaignStatsProps {
  campaign: Campaign;
  refreshInterval?: number;        // Auto-refresh interval (ms)
  showDetailed?: boolean;          // Show detailed metrics
  className?: string;              // CSS classes
}
```

#### Usage Examples
```typescript
// Basic stats display
<CampaignStats campaign={campaign} />

// With auto-refresh
<CampaignStats 
  campaign={campaign}
  refreshInterval={30000}          // Refresh every 30 seconds
  showDetailed={true}
/>

// Custom styling
<CampaignStats 
  campaign={campaign}
  className="bg-white rounded-lg shadow-lg p-6"
/>
```

#### Displayed Metrics
- **Total Domains**: Generated domain count
- **Valid Domains**: Domains passing validation
- **Success Rate**: Percentage of valid domains
- **Processing Speed**: Domains per minute
- **Estimated Completion**: Time remaining

## Monitoring Components

### MonitoringProvider Component
Provider component that initializes the performance monitoring system for the entire application.

#### Props
```typescript
interface MonitoringProviderProps {
  children: ReactNode;
  customHooks?: MonitoringHooks;   // Custom monitoring event handlers
  enableConsoleLogging?: boolean;  // Enable debug console logging
}
```

#### Usage Examples
```typescript
// Basic setup (typically in _app.tsx or layout)
<MonitoringProvider>
  <App />
</MonitoringProvider>

// With custom hooks and logging
<MonitoringProvider
  enableConsoleLogging={isDevelopment}
  customHooks={{
    onApiError: (url, method, duration, error) => {
      // Custom error handling
      errorReportingService.report(error, { url, method, duration });
    },
    onPageLoad: (url, loadTime) => {
      // Custom page load tracking
      analytics.track('page_load', { url, loadTime });
    }
  }}
>
  <App />
</MonitoringProvider>
```

#### Features
- ✅ Automatic Web Vitals collection
- ✅ API performance monitoring
- ✅ Component render tracking
- ✅ Error reporting
- ✅ Memory usage monitoring

### Higher-Order Components

#### withMonitoring HOC
Higher-order component that automatically adds performance monitoring to any React component.

```typescript
// Basic usage
const MonitoredButton = withMonitoring(Button, 'ActionButton');

// Usage in component
const MyComponent = withMonitoring(
  ({ title, children }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
  'MyComponent'
);
```

#### Features
- ✅ Automatic mount/unmount timing
- ✅ Render performance tracking
- ✅ Component-specific metrics
- ✅ Zero configuration required

## Validation Components

### API Client Wrapper
Enhanced API client with automatic request/response validation.

#### Usage Examples
```typescript
import { apiClientWrapper } from '@/lib/api/api-client-wrapper';

// Automatic validation
const campaigns = await apiClientWrapper.get('/api/v2/campaigns');
// Throws validation error if response format is invalid

// Custom validation
const response = await apiClientWrapper.post('/api/v2/campaigns', {
  name: 'Test Campaign',
  type: 'domain_generation'
}, {
  validator: customCampaignValidator
});
```

## Styling Guidelines

### CSS Classes
All Phase 5 components follow consistent styling patterns:

```css
/* Permission components */
.permission-denied {
  @apply text-red-600 bg-red-50 border border-red-200 rounded-lg p-4;
}

.permission-loading {
  @apply animate-pulse bg-gray-200 rounded;
}

/* BigInt components */
.bigint-display {
  @apply font-mono text-right;
}

.bigint-input {
  @apply font-mono border-gray-300 focus:border-blue-500;
}

.bigint-error {
  @apply border-red-500 bg-red-50;
}

/* Campaign stats */
.campaign-stats {
  @apply grid grid-cols-2 md:grid-cols-4 gap-4;
}

.stat-card {
  @apply bg-white rounded-lg shadow p-4 text-center;
}
```

### Responsive Design
All components are fully responsive and support:
- ✅ Mobile-first design
- ✅ Tablet optimization
- ✅ Desktop layouts
- ✅ Accessibility standards

## Accessibility Features

### ARIA Support
All components include comprehensive ARIA attributes:

```typescript
// WithPermission
<div role="region" aria-label="Protected content">
  {authorizedContent}
</div>

// BigIntInput
<input
  aria-describedby={`${id}-error ${id}-help`}
  aria-invalid={!!error}
  aria-required={required}
/>

// CampaignStats
<div role="status" aria-live="polite" aria-label="Campaign statistics">
  {statsContent}
</div>
```

### Keyboard Navigation
- ✅ Tab order management
- ✅ Focus indicators
- ✅ Keyboard shortcuts
- ✅ Screen reader support

## Testing Support

### Test Utilities
Components include testing utilities and mock providers:

```typescript
// Testing with MonitoringProvider
import { MockMonitoringProvider } from '@/lib/monitoring/test-utils';

render(
  <MockMonitoringProvider>
    <ComponentToTest />
  </MockMonitoringProvider>
);

// Testing permission components
import { MockPermissionProvider } from '@/components/auth/test-utils';

render(
  <MockPermissionProvider permissions={['campaigns:read']}>
    <WithPermission permissions={['campaigns:read']}>
      <TestComponent />
    </WithPermission>
  </MockPermissionProvider>
);
```

### Component Testing Examples
```typescript
describe('BigIntDisplay', () => {
  it('formats large numbers correctly', () => {
    render(<BigIntDisplay value={1500000000n} format="abbreviated" />);
    expect(screen.getByText('1.5B')).toBeInTheDocument();
  });

  it('shows tooltip with full value', () => {
    render(
      <BigIntDisplay 
        value={1234567890n} 
        showTooltip={true}
      />
    );
    expect(screen.getByTitle('1,234,567,890')).toBeInTheDocument();
  });
});
```

## Performance Considerations

### Optimization Features
- ✅ **Memoization**: All components use React.memo() where appropriate
- ✅ **Lazy Loading**: Components support code splitting
- ✅ **Bundle Size**: Minimal impact on bundle size
- ✅ **Runtime Performance**: Optimized for 60fps rendering

### Memory Management
- ✅ Automatic cleanup of event listeners
- ✅ Efficient permission caching
- ✅ Monitoring buffer management
- ✅ BigInt value recycling

## Migration Guide

### Upgrading Existing Components
To add monitoring to existing components:

```typescript
// Before
const MyComponent = () => {
  return <div>Content</div>;
};

// After
const MyComponent = () => {
  const { recordMetric } = useMonitoring({
    componentName: 'MyComponent'
  });
  
  return <div>Content</div>;
};

// Or using HOC
const MyComponent = withMonitoring(() => {
  return <div>Content</div>;
}, 'MyComponent');
```

### Adding Permission Guards
```typescript
// Before
const AdminPanel = () => {
  return <div>Admin content</div>;
};

// After
const AdminPanel = () => {
  return (
    <WithPermission permissions={['admin:access']}>
      <div>Admin content</div>
    </WithPermission>
  );
};
```

This completes the comprehensive component documentation for Phase 5 implementations.
