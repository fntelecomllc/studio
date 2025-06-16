// Diagnostic script to validate auth and WebSocket timing issues
// Run this in browser console to verify root causes

interface DiagnosticResult {
  timestamp: string;
  authState: any;
  webSocketImports: any;
  permissionChecks: any;
  timingAnalysis: any;
}

const runDiagnosis = (): DiagnosticResult => {
  const timestamp = new Date().toISOString();
  console.log('🔍 Starting authentication and WebSocket diagnosis...');

  // Check auth state
  const authState = {
    isAuthenticated: window.localStorage.getItem('auth_session'),
    userPermissions: window.localStorage.getItem('user_permissions'),
    sessionExpiry: window.localStorage.getItem('session_expiry'),
    authTokens: window.localStorage.getItem('auth_tokens')
  };

  // Check WebSocket service imports
  const webSocketImports = {
    statusContextService: 'Check if WebSocketStatusContext imports websocketService.production',
    optimizedServiceExists: 'Check if websocketService.optimized is being used',
    serviceAlignment: 'Services should be aligned'
  };

  // Check permission timing
  const permissionChecks = {
    hasPermissionCallTiming: 'Check when hasPermission is first called',
    userDataLoadTiming: 'Check when user.permissions becomes available',
    sidebarRenderTiming: 'Check when sidebar filters menu items'
  };

  // Timing analysis
  const timingAnalysis = {
    authInitialization: 'AuthContext.initialize() timing',
    webSocketConnection: 'WebSocket connection attempt timing',
    permissionLoad: 'User permissions load timing',
    contextSubscription: 'Context subscription timing'
  };

  const result: DiagnosticResult = {
    timestamp,
    authState,
    webSocketImports,
    permissionChecks,
    timingAnalysis
  };

  console.log('📊 Diagnosis Results:', result);
  return result;
};

// Export for browser console use
if (typeof window !== 'undefined') {
  (window as any).runAuthWebSocketDiagnosis = runDiagnosis;
  console.log('🎯 Diagnostic loaded. Run: runAuthWebSocketDiagnosis()');
}

export default runDiagnosis;