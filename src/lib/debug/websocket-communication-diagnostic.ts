/**
 * WebSocket Communication Comprehensive Diagnostic Tool
 * Main diagnostic runner that coordinates all diagnostic tools and provides analysis
 */

import { websocketAuthDiagnostic } from './websocket-auth-diagnostic';
import { messageFormatDiagnostic } from './message-format-diagnostic';
import { campaignLifecycleDiagnostic } from './campaign-lifecycle-diagnostic';
import { connectionManagementDiagnostic } from './connection-management-diagnostic';

export interface WebSocketCommunicationAnalysis {
  timestamp: string;
  diagnosticSession: string;
  findings: {
    authTokenSyncIssues: {
      severity: 'critical' | 'high' | 'medium' | 'low';
      summary: string;
      specificIssues: string[];
      rootCauses: string[];
      evidence: unknown[];
    };
    messageFormatProblems: {
      severity: 'critical' | 'high' | 'medium' | 'low';
      summary: string;
      specificIssues: string[];
      rootCauses: string[];
      evidence: unknown[];
    };
    campaignSyncProblems: {
      severity: 'critical' | 'high' | 'medium' | 'low';
      summary: string;
      specificIssues: string[];
      rootCauses: string[];
      evidence: unknown[];
    };
    connectionManagementIssues: {
      severity: 'critical' | 'high' | 'medium' | 'low';
      summary: string;
      specificIssues: string[];
      rootCauses: string[];
      evidence: unknown[];
    };
    environmentConfigIssues: {
      severity: 'critical' | 'high' | 'medium' | 'low';
      summary: string;
      specificIssues: string[];
      rootCauses: string[];
      evidence: unknown[];
    };
  };
  overallAssessment: {
    primaryRootCause: string;
    secondaryRootCause: string;
    criticalFindings: string[];
    recommendedFixes: string[];
    estimatedImpact: 'system_breaking' | 'major_degradation' | 'moderate_issues' | 'minor_issues';
  };
  technicalDetails: {
    authDiagnostic: unknown;
    messageDiagnostic: unknown;
    campaignDiagnostic: unknown;
    connectionDiagnostic: unknown;
  };
}

class WebSocketCommunicationDiagnostic {
  private diagnosticSession: string;
  private isRunning: boolean = false;

  constructor() {
    this.diagnosticSession = `ws-diag-${Date.now()}`;
  }

  async runComprehensiveDiagnostic(durationMinutes: number = 2): Promise<WebSocketCommunicationAnalysis> {
    if (this.isRunning) {
      throw new Error('Diagnostic already running. Stop current session before starting new one.');
    }

    console.log(`[WebSocket Communication Diagnostic] Starting comprehensive diagnostic session: ${this.diagnosticSession}`);
    console.log(`[WebSocket Communication Diagnostic] Duration: ${durationMinutes} minutes`);
    
    this.isRunning = true;

    try {
      // Start all diagnostic tools
      websocketAuthDiagnostic.startDiagnostic();
      messageFormatDiagnostic.startDiagnostic();
      campaignLifecycleDiagnostic.startDiagnostic();
      connectionManagementDiagnostic.startDiagnostic();

      console.log('[WebSocket Communication Diagnostic] All diagnostic tools started. Collecting data...');

      // Run for specified duration
      await new Promise(resolve => setTimeout(resolve, durationMinutes * 60 * 1000));

      console.log('[WebSocket Communication Diagnostic] Data collection complete. Analyzing results...');

      // Collect diagnostic reports
      const authReport = websocketAuthDiagnostic.getDiagnosticReport();
      const messageReport = messageFormatDiagnostic.getSerializationReport();
      const campaignReport = campaignLifecycleDiagnostic.getDiagnosticReport();
      const connectionReport = connectionManagementDiagnostic.getDiagnosticReport();

      // Analyze findings
      const analysis = this.analyzeFindings(authReport, messageReport, campaignReport, connectionReport);

      console.log('[WebSocket Communication Diagnostic] Analysis complete');
      return analysis;

    } finally {
      // Always stop diagnostic tools
      this.stopAllDiagnostics();
      this.isRunning = false;
    }
  }

  private analyzeFindings(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    authReport: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messageReport: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    campaignReport: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    connectionReport: any
  ): WebSocketCommunicationAnalysis {
    
    const analysis: WebSocketCommunicationAnalysis = {
      timestamp: new Date().toISOString(),
      diagnosticSession: this.diagnosticSession,
      findings: {
        authTokenSyncIssues: this.analyzeAuthTokenSync(authReport),
        messageFormatProblems: this.analyzeMessageFormat(messageReport),
        campaignSyncProblems: this.analyzeCampaignSync(campaignReport),
        connectionManagementIssues: this.analyzeConnectionManagement(connectionReport),
        environmentConfigIssues: this.analyzeEnvironmentConfig(),
      },
      overallAssessment: {
        primaryRootCause: '',
        secondaryRootCause: '',
        criticalFindings: [],
        recommendedFixes: [],
        estimatedImpact: 'moderate_issues',
      },
      technicalDetails: {
        authDiagnostic: authReport,
        messageDiagnostic: messageReport,
        campaignDiagnostic: campaignReport,
        connectionDiagnostic: connectionReport,
      },
    };

    // Determine overall assessment
    this.determineOverallAssessment(analysis);

    return analysis;
  }

  private analyzeAuthTokenSync(authReport: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const issues: string[] = [];
    const rootCauses: string[] = [];
    const evidence: unknown[] = [];

    // Analyze token synchronization issues
    if (authReport.summary.totalSyncIssues > 0) {
      issues.push(`${authReport.summary.totalSyncIssues} token synchronization issues detected`);
      evidence.push(authReport.summary.commonIssues);
    }

    // Check token refresh coordination
    if (authReport.summary.tokenRefreshCount > authReport.summary.websocketReconnectionCount) {
      issues.push('Token refreshes not consistently triggering WebSocket reconnections');
      rootCauses.push('Missing coordination between authService token refresh and WebSocket reconnection');
    }

    // Common sync issues analysis
    authReport.summary.commonIssues.forEach((issue: string) => {
      if (issue.includes('authService token') && issue.includes('apiClient token')) {
        rootCauses.push('Manual CSRF token propagation between authService and apiClient is unreliable');
      }
      if (issue.includes('Session expired but WebSocket connections still active')) {
        rootCauses.push('WebSocket connections not properly cleaned up on session expiry');
      }
    });

    const severity: 'critical' | 'high' | 'medium' | 'low' = rootCauses.length > 0 ? 'high' : issues.length > 0 ? 'medium' : 'low';

    return {
      severity,
      summary: issues.length > 0 
        ? `Authentication token synchronization issues detected. ${issues.length} specific problems found.`
        : 'No significant authentication token synchronization issues detected.',
      specificIssues: issues,
      rootCauses,
      evidence,
    };
  }

  private analyzeMessageFormat(messageReport: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const issues: string[] = [];
    const rootCauses: string[] = [];
    const evidence: unknown[] = [];

    // Analyze transformation success rate
    const transformationSuccessRate = messageReport.totalMessages > 0 
      ? messageReport.successfulTransformations / messageReport.totalMessages 
      : 1;

    if (transformationSuccessRate < 0.9) {
      issues.push(`Low message transformation success rate: ${(transformationSuccessRate * 100).toFixed(1)}%`);
      evidence.push({ transformationSuccessRate, totalMessages: messageReport.totalMessages });
    }

    // Analyze common field mismatches
    const criticalMismatches = Object.keys(messageReport.commonFieldMismatches).filter(mismatch => 
      mismatch.includes('CampaignID') || mismatch.includes('Type') || mismatch.includes('flat structure')
    );

    if (criticalMismatches.length > 0) {
      issues.push('Critical field naming and structure mismatches between backend and frontend');
      rootCauses.push('Backend uses Go naming conventions (CampaignID, Type) while frontend expects JavaScript conventions (campaignId, type)');
      rootCauses.push('Backend uses flat message structure while frontend expects nested data object');
      evidence.push(messageReport.commonFieldMismatches);
    }

    // Check for dropped messages
    if (messageReport.droppedMessages > 0) {
      issues.push(`${messageReport.droppedMessages} messages could not be parsed`);
      rootCauses.push('Invalid JSON or unexpected message format from backend');
    }

    const formatDifferences = messageFormatDiagnostic.analyzeFormatDifferences();
    evidence.push(formatDifferences);

    const severity: 'critical' | 'high' | 'medium' | 'low' = rootCauses.length > 0 ? 'high' : issues.length > 0 ? 'medium' : 'low';

    return {
      severity,
      summary: issues.length > 0 
        ? `Message format and serialization problems detected. Primary issue: backend/frontend format mismatch.`
        : 'No significant message format issues detected.',
      specificIssues: issues,
      rootCauses,
      evidence,
    };
  }

  private analyzeCampaignSync(campaignReport: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const issues: string[] = [];
    const rootCauses: string[] = [];
    const evidence: unknown[] = [];

    const syncAnalysis = campaignReport.syncAnalysis;

    // Check for orphaned operations
    if (syncAnalysis.orphanedWebSocketSubscriptions.length > 0) {
      issues.push(`${syncAnalysis.orphanedWebSocketSubscriptions.length} orphaned WebSocket subscriptions (no REST API data)`);
      rootCauses.push('WebSocket subscriptions created without corresponding REST API campaign data');
    }

    if (syncAnalysis.orphanedRestCampaigns.length > 0) {
      issues.push(`${syncAnalysis.orphanedRestCampaigns.length} campaigns with REST data but no WebSocket subscription`);
      rootCauses.push('Campaign operations via REST API not coordinated with WebSocket subscriptions');
    }

    // Check for duplicate subscriptions
    if (syncAnalysis.duplicateSubscriptions.length > 0) {
      issues.push(`${syncAnalysis.duplicateSubscriptions.length} campaigns with duplicate subscriptions`);
      rootCauses.push('WebSocket subscription cleanup not properly implemented');
    }

    // Check overall sync health
    if (syncAnalysis.campaignsWithSyncIssues > syncAnalysis.totalCampaigns * 0.3) {
      issues.push('High percentage of campaigns with synchronization issues');
      rootCauses.push('Lack of centralized state management between REST API and WebSocket operations');
    }

    evidence.push(syncAnalysis);

    const severity: 'critical' | 'high' | 'medium' | 'low' = syncAnalysis.campaignsWithSyncIssues > 0 ? 'high' : issues.length > 0 ? 'medium' : 'low';

    return {
      severity,
      summary: issues.length > 0 
        ? `Campaign lifecycle synchronization issues detected. ${syncAnalysis.campaignsWithSyncIssues} campaigns affected.`
        : 'Campaign lifecycle synchronization appears healthy.',
      specificIssues: issues,
      rootCauses,
      evidence,
    };
  }

  private analyzeConnectionManagement(connectionReport: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const issues: string[] = [];
    const rootCauses: string[] = [];
    const evidence: unknown[] = [];

    const analysis = connectionReport.analysis;
    const coordinationIssues = connectionReport.coordinationIssues;

    // Check reconnection success rate
    const reconnectionSuccessRate = analysis.totalReconnectionAttempts > 0 
      ? analysis.successfulReconnections / analysis.totalReconnectionAttempts 
      : 1;

    if (reconnectionSuccessRate < 0.8) {
      issues.push(`Low WebSocket reconnection success rate: ${(reconnectionSuccessRate * 100).toFixed(1)}%`);
      rootCauses.push('WebSocket reconnection logic not robust or authentication issues during reconnection');
    }

    // Check token refresh coordination
    if (analysis.tokenRefreshCoordinationRate < 0.7) {
      issues.push(`Poor token refresh coordination: ${(analysis.tokenRefreshCoordinationRate * 100).toFixed(1)}% of token refreshes trigger WebSocket reconnection`);
      rootCauses.push('No automatic WebSocket reconnection on authentication token refresh');
    }

    // Check for stale connections
    if (coordinationIssues.staleConnections.length > 0) {
      issues.push(`${coordinationIssues.staleConnections.length} potentially stale WebSocket connections`);
      rootCauses.push('Insufficient connection health monitoring and cleanup');
    }

    // Check connection stability
    if (analysis.connectionStabilityScore < 0.7) {
      issues.push(`Low connection stability score: ${(analysis.connectionStabilityScore * 100).toFixed(1)}%`);
      rootCauses.push('Frequent connection disruptions indicate underlying connectivity or authentication issues');
    }

    evidence.push(analysis, coordinationIssues);

    const severity: 'critical' | 'high' | 'medium' | 'low' = analysis.connectionStabilityScore < 0.5 ? 'critical' : rootCauses.length > 0 ? 'high' : 'medium';

    return {
      severity,
      summary: issues.length > 0 
        ? `Connection management and recovery issues detected. Stability score: ${(analysis.connectionStabilityScore * 100).toFixed(1)}%`
        : 'Connection management appears stable.',
      specificIssues: issues,
      rootCauses,
      evidence,
    };
  }

  private analyzeEnvironmentConfig() {
    const issues: string[] = [];
    const rootCauses: string[] = [];
    const evidence: unknown[] = [];

    // Check current environment setup (based on environment.ts analysis)
    const currentEnv = typeof window !== 'undefined' ? 
      (window.location.hostname === 'localhost' ? 'development' : 'production') : 'unknown';

    evidence.push({ currentEnvironment: currentEnv });

    // Known issues from environment.ts analysis
    if (currentEnv === 'development') {
      // WebSocket URL construction issues
      issues.push('Development WebSocket URL hardcoded to localhost:8080 may not match actual backend');
      rootCauses.push('WebSocket URL construction in development environment assumes specific port configuration');
    }

    // CORS configuration issues
    issues.push('Backend WebSocket handler allows all origins in development (potential security risk)');
    rootCauses.push('CheckOrigin function in backend websocket handler returns true for all origins');

    const severity: 'critical' | 'high' | 'medium' | 'low' = issues.length > 1 ? 'medium' : 'low';

    return {
      severity,
      summary: issues.length > 0 
        ? 'Environment configuration issues detected, primarily in development setup.'
        : 'Environment configuration appears correct.',
      specificIssues: issues,
      rootCauses,
      evidence,
    };
  }

  private determineOverallAssessment(analysis: WebSocketCommunicationAnalysis): void {
    const findings = analysis.findings;
    const criticalFindings: string[] = [];
    const recommendedFixes: string[] = [];

    // Collect all critical and high severity issues
    Object.values(findings).forEach(finding => {
      if (finding.severity === 'critical' || finding.severity === 'high') {
        criticalFindings.push(...finding.specificIssues);
        finding.rootCauses.forEach(cause => {
          if (!recommendedFixes.some(fix => fix.includes(cause.substring(0, 30)))) {
            recommendedFixes.push(this.generateRecommendedFix(cause));
          }
        });
      }
    });

    // Determine primary root causes based on frequency and impact
    const rootCauseFrequency: Record<string, number> = {};
    Object.values(findings).forEach(finding => {
      finding.rootCauses.forEach(cause => {
        const key = this.categorizeRootCause(cause);
        rootCauseFrequency[key] = (rootCauseFrequency[key] || 0) + 1;
      });
    });

    const sortedCauses = Object.entries(rootCauseFrequency)
      .sort(([,a], [,b]) => b - a);

    analysis.overallAssessment = {
      primaryRootCause: sortedCauses[0]?.[0] || 'Authentication token synchronization issues',
      secondaryRootCause: sortedCauses[1]?.[0] || 'Message format and serialization problems',
      criticalFindings,
      recommendedFixes,
      estimatedImpact: this.estimateImpact(findings),
    };
  }

  private categorizeRootCause(rootCause: string): string {
    if (rootCause.includes('token') || rootCause.includes('auth') || rootCause.includes('CSRF')) {
      return 'Authentication token synchronization issues';
    }
    if (rootCause.includes('format') || rootCause.includes('message') || rootCause.includes('field') || rootCause.includes('structure')) {
      return 'Message format and serialization problems';
    }
    if (rootCause.includes('campaign') || rootCause.includes('subscription') || rootCause.includes('sync')) {
      return 'Campaign subscription lifecycle issues';
    }
    if (rootCause.includes('connection') || rootCause.includes('reconnection') || rootCause.includes('WebSocket')) {
      return 'Connection management and recovery issues';
    }
    return 'Configuration and environment issues';
  }

  private generateRecommendedFix(rootCause: string): string {
    if (rootCause.includes('Manual CSRF token propagation')) {
      return 'Implement automatic CSRF token synchronization between authService and apiClient';
    }
    if (rootCause.includes('WebSocket reconnection')) {
      return 'Add automatic WebSocket reconnection on authentication token refresh';
    }
    if (rootCause.includes('naming conventions')) {
      return 'Standardize field naming conventions between backend (Go) and frontend (TypeScript)';
    }
    if (rootCause.includes('flat structure')) {
      return 'Implement consistent message structure (prefer nested data object)';
    }
    if (rootCause.includes('centralized state management')) {
      return 'Implement centralized state management for campaign operations across REST API and WebSocket';
    }
    if (rootCause.includes('connection health monitoring')) {
      return 'Add comprehensive connection health monitoring and automatic cleanup';
    }
    return `Address: ${rootCause}`;
  }

  private estimateImpact(findings: WebSocketCommunicationAnalysis['findings']): 'system_breaking' | 'major_degradation' | 'moderate_issues' | 'minor_issues' {
    const criticalCount = Object.values(findings).filter(f => f.severity === 'critical').length;
    const highCount = Object.values(findings).filter(f => f.severity === 'high').length;
    
    if (criticalCount > 0) return 'system_breaking';
    if (highCount >= 3) return 'major_degradation';
    if (highCount >= 1) return 'moderate_issues';
    return 'minor_issues';
  }

  private stopAllDiagnostics(): void {
    try {
      websocketAuthDiagnostic.stopDiagnostic();
      messageFormatDiagnostic.stopDiagnostic();
      campaignLifecycleDiagnostic.stopDiagnostic();
      connectionManagementDiagnostic.stopDiagnostic();
    } catch (error) {
      console.warn('[WebSocket Communication Diagnostic] Error stopping diagnostics:', error);
    }
  }

  // Quick diagnostic for immediate issues
  runQuickDiagnostic(): Promise<WebSocketCommunicationAnalysis> {
    return this.runComprehensiveDiagnostic(0.5); // 30 seconds
  }

  // Test specific scenarios
  async testTokenRefreshScenario(): Promise<void> {
    console.log('[WebSocket Communication Diagnostic] Testing token refresh scenario...');
    websocketAuthDiagnostic.startDiagnostic();
    
    // Trigger a token refresh if possible
    try {
      const authService = await import('@/lib/services/authService');
      await authService.authService.refreshSession();
    } catch (error) {
      console.log('Token refresh test failed (expected if not authenticated):', error);
    }
    
    setTimeout(() => {
      const report = websocketAuthDiagnostic.getDiagnosticReport();
      console.log('Token refresh test results:', report);
      websocketAuthDiagnostic.stopDiagnostic();
    }, 5000);
  }

  async testCampaignLifecycleScenario(): Promise<void> {
    console.log('[WebSocket Communication Diagnostic] Testing campaign lifecycle scenario...');
    campaignLifecycleDiagnostic.startDiagnostic();
    campaignLifecycleDiagnostic.simulateLifecycleScenarios();
    
    setTimeout(() => {
      const report = campaignLifecycleDiagnostic.getDiagnosticReport();
      console.log('Campaign lifecycle test results:', report);
      campaignLifecycleDiagnostic.stopDiagnostic();
    }, 3000);
  }
}

// Export singleton instance
export const websocketCommunicationDiagnostic = new WebSocketCommunicationDiagnostic();

// Convenience function for quick debugging
export async function runWebSocketDiagnostic(durationMinutes: number = 2): Promise<WebSocketCommunicationAnalysis> {
  return websocketCommunicationDiagnostic.runComprehensiveDiagnostic(durationMinutes);
}

// Global debugging functions
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).runWebSocketDiagnostic = runWebSocketDiagnostic;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).websocketDiagnostic = websocketCommunicationDiagnostic;
}