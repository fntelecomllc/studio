/**
 * Message Format and Serialization Diagnostic Tool
 * Debug tool to analyze message structure mismatches between backend and frontend
 */

import { websocketService } from '@/lib/services/websocketService.simple';
import type { CampaignProgressMessage } from '@/lib/services/websocketService.simple';

export interface MessageFormatDiagnosticLog {
  timestamp: string;
  rawMessage: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parsedMessage: any;
  expectedFormat: CampaignProgressMessage | null;
  transformationApplied: boolean;
  transformationIssues: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fieldMappingLog: Record<string, any>;
}

export interface MessageSerializationReport {
  totalMessages: number;
  successfulTransformations: number;
  failedTransformations: number;
  commonFieldMismatches: Record<string, number>;
  droppedMessages: number;
  messageTypeDistribution: Record<string, number>;
  detailedLogs: MessageFormatDiagnosticLog[];
}

class MessageFormatDiagnostic {
  private messageLog: MessageFormatDiagnosticLog[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private originalConnectToCampaign: any;
  private messageTypePatterns: Set<string> = new Set();

  startDiagnostic(): void {
    console.log('[Message Format Diagnostic] Starting message format analysis...');
    
    // Hook into WebSocket message handling
    this.hookWebSocketMessageHandling();
    
    console.log('[Message Format Diagnostic] Message format hooks installed');
  }

  private hookWebSocketMessageHandling(): void {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    this.originalConnectToCampaign = websocketService.connectToCampaign.bind(websocketService);
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (websocketService as any).connectToCampaign = function(
      campaignId: string, 
      onMessage: (message: CampaignProgressMessage) => void, 
      onError?: (error: Event | Error) => void
    ) {
      console.log(`[Message Format Diagnostic] Hooking message handler for campaign: ${campaignId}`);
      
      // Wrap the onMessage callback to intercept and analyze messages
      const wrappedOnMessage = (message: CampaignProgressMessage) => {
        // This is after transformation, log the successful transformation
        self.logSuccessfulTransformation(message, campaignId);
        
        // Call original callback
        onMessage(message);
      };
      
      // Call original method with wrapped callback
      const cleanup = self.originalConnectToCampaign.call(this, campaignId, wrappedOnMessage, onError);
      
      // Also hook the internal WebSocket onmessage to catch raw messages
      self.hookRawMessageCapture(campaignId);
      
      return cleanup;
    };
  }

  private hookRawMessageCapture(campaignId: string): void {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    
    // We need to hook into the WebSocket creation process
    const originalWebSocket = window.WebSocket;
    let isHooked = false;
    
    if (!isHooked) {
      window.WebSocket = class extends originalWebSocket {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols);
          
          // Hook the onmessage event to capture raw messages
          const originalOnMessage = this.onmessage;
          this.onmessage = (event: MessageEvent) => {
            try {
              self.analyzeRawMessage(event.data, campaignId);
            } catch (error) {
              console.error('[Message Format Diagnostic] Error analyzing raw message:', error);
            }
            
            // Call original handler
            if (originalOnMessage) {
              originalOnMessage.call(this, event);
            }
          };
        }
      };
      
      isHooked = true;
    }
  }

  private analyzeRawMessage(rawData: string, campaignId: string): void {
    const diagnostic: MessageFormatDiagnosticLog = {
      timestamp: new Date().toISOString(),
      rawMessage: rawData,
      parsedMessage: null,
      expectedFormat: null,
      transformationApplied: false,
      transformationIssues: [],
      fieldMappingLog: {},
    };

    try {
      // Parse the raw message
      diagnostic.parsedMessage = JSON.parse(rawData);
      
      // Record message type pattern
      if (diagnostic.parsedMessage.type) {
        this.messageTypePatterns.add(diagnostic.parsedMessage.type);
      }
      
      // Analyze the message structure
      this.analyzeMessageStructure(diagnostic, campaignId);
      
      // Attempt to transform to expected format
      this.attemptMessageTransformation(diagnostic, campaignId);
      
    } catch (parseError) {
      diagnostic.transformationIssues.push(`JSON parsing failed: ${parseError}`);
      console.error('[Message Format Diagnostic] Failed to parse raw message:', parseError, rawData);
    }
    
    this.messageLog.push(diagnostic);
    
    // Log critical issues immediately
    if (diagnostic.transformationIssues.length > 0) {
      console.warn('[Message Format Diagnostic] Message transformation issues:', diagnostic.transformationIssues, diagnostic);
    }
  }

  private analyzeMessageStructure(diagnostic: MessageFormatDiagnosticLog, _campaignId: string): void {
    const message = diagnostic.parsedMessage;
    const issues: string[] = [];
    
    // Check for expected backend format (from client.go)
    const backendFields = ['Type', 'Data', 'Payload', 'Message', 'CampaignID', 'Phase', 'Status', 'Progress'];
    const frontendFields = ['type', 'campaignId', 'data', 'message'];
    
    // Analyze field presence and casing
    diagnostic.fieldMappingLog = {};
    
    // Check backend field patterns
    for (const field of backendFields) {
      if (message.hasOwnProperty(field)) {
        diagnostic.fieldMappingLog[field] = message[field];
      }
    }
    
    // Check frontend field patterns
    for (const field of frontendFields) {
      if (message.hasOwnProperty(field)) {
        diagnostic.fieldMappingLog[field] = message[field];
      }
    }
    
    // Identify casing issues
    if (message.CampaignID && !message.campaignId) {
      issues.push('Backend uses CampaignID but frontend expects campaignId');
    }
    
    if (message.Type && !message.type) {
      issues.push('Backend uses Type but frontend expects type');
    }
    
    // Check for flat vs nested structure
    if (message.Phase || message.Status || message.Progress) {
      if (!message.data && !message.Data) {
        issues.push('Backend uses flat structure (Phase, Status, Progress) but frontend expects nested data object');
      }
    }
    
    // Check for mixed casing in same message
    const hasUpperCaseFields = backendFields.some(field => message.hasOwnProperty(field));
    const hasLowerCaseFields = frontendFields.some(field => message.hasOwnProperty(field));
    
    if (hasUpperCaseFields && hasLowerCaseFields) {
      issues.push('Message contains mixed case fields (both backend and frontend conventions)');
    }
    
    diagnostic.transformationIssues.push(...issues);
  }

  private attemptMessageTransformation(diagnostic: MessageFormatDiagnosticLog, campaignId: string): void {
    const message = diagnostic.parsedMessage;
    
    try {
      // Attempt to create the expected frontend format
      const expectedFormat: CampaignProgressMessage = {
        type: message.type || message.Type || 'unknown',
        campaignId: message.campaignId || message.CampaignID || campaignId,
        data: {},
        message: message.message || message.Message,
      };
      
      // Handle nested vs flat data structure
      if (message.data) {
        // Already has nested data structure
        expectedFormat.data = message.data;
        diagnostic.transformationApplied = false; // No transformation needed
      } else if (message.Data) {
        // Backend uses capitalized Data
        expectedFormat.data = message.Data;
        diagnostic.transformationApplied = true;
      } else {
        // Need to create nested structure from flat fields
        expectedFormat.data = {
          progress: message.progress || message.Progress,
          phase: message.phase || message.Phase,
          status: message.status || message.Status,
          error: message.error || message.Error,
          domains: message.domains || message.Domains,
          validationResults: message.validationResults || message.ValidationResults,
        };
        diagnostic.transformationApplied = true;
      }
      
      // Remove undefined values from data
      expectedFormat.data = Object.fromEntries(
        Object.entries(expectedFormat.data).filter(([_, value]) => value !== undefined)
      );
      
      diagnostic.expectedFormat = expectedFormat;
      
      // Validate the transformation
      this.validateTransformation(diagnostic);
      
    } catch (transformError) {
      diagnostic.transformationIssues.push(`Transformation failed: ${transformError}`);
      console.error('[Message Format Diagnostic] Transformation failed:', transformError);
    }
  }

  private validateTransformation(diagnostic: MessageFormatDiagnosticLog): void {
    const expected = diagnostic.expectedFormat;
    const original = diagnostic.parsedMessage;
    
    if (!expected) {
      diagnostic.transformationIssues.push('No expected format generated');
      return;
    }
    
    // Check for data loss during transformation
    const originalKeys = Object.keys(original);
    const transformedKeys = ['type', 'campaignId', 'message', ...Object.keys(expected.data || {})];
    
    const lostKeys = originalKeys.filter(key => 
      !transformedKeys.includes(key) && 
      !transformedKeys.includes(key.toLowerCase()) &&
      !transformedKeys.includes(key.charAt(0).toLowerCase() + key.slice(1))
    );
    
    if (lostKeys.length > 0) {
      diagnostic.transformationIssues.push(`Potential data loss: fields ${lostKeys.join(', ')} not mapped`);
    }
    
    // Check required fields
    if (!expected.type) {
      diagnostic.transformationIssues.push('Missing required field: type');
    }
    
    if (!expected.campaignId) {
      diagnostic.transformationIssues.push('Missing required field: campaignId');
    }
  }

  private logSuccessfulTransformation(message: CampaignProgressMessage, campaignId: string): void {
    console.log(`[Message Format Diagnostic] Successfully received transformed message for campaign ${campaignId}:`, message);
  }

  getMessageTypePatterns(): string[] {
    return Array.from(this.messageTypePatterns);
  }

  getSerializationReport(): MessageSerializationReport {
    const totalMessages = this.messageLog.length;
    const successfulTransformations = this.messageLog.filter(log => 
      log.expectedFormat && log.transformationIssues.length === 0
    ).length;
    const failedTransformations = totalMessages - successfulTransformations;
    
    // Count common field mismatches
    const commonFieldMismatches: Record<string, number> = {};
    this.messageLog.forEach(log => {
      log.transformationIssues.forEach(issue => {
        commonFieldMismatches[issue] = (commonFieldMismatches[issue] || 0) + 1;
      });
    });
    
    // Count dropped messages (messages that couldn't be parsed at all)
    const droppedMessages = this.messageLog.filter(log => !log.parsedMessage).length;
    
    // Message type distribution
    const messageTypeDistribution: Record<string, number> = {};
    this.messageLog.forEach(log => {
      if (log.parsedMessage?.type || log.parsedMessage?.Type) {
        const type = log.parsedMessage.type || log.parsedMessage.Type;
        messageTypeDistribution[type] = (messageTypeDistribution[type] || 0) + 1;
      }
    });
    
    return {
      totalMessages,
      successfulTransformations,
      failedTransformations,
      commonFieldMismatches,
      droppedMessages,
      messageTypeDistribution,
      detailedLogs: this.messageLog,
    };
  }

  // Analyze specific backend vs frontend format differences
  analyzeFormatDifferences(): {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    backendFormat: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    frontendFormat: any;
    criticalMismatches: string[];
    recommendations: string[];
  } {
    const backendFormat = {
      structure: 'Flat fields at root level',
      fields: {
        Type: 'string',
        CampaignID: 'string',
        Data: 'interface{}',
        Payload: 'interface{}',
        Message: 'string',
        Phase: 'string',
        Status: 'string',
        Progress: 'float64',
      },
      example: {
        Type: 'progress',
        CampaignID: 'campaign-123',
        Phase: 'DomainGeneration',
        Status: 'InProgress',
        Progress: 50.0,
        Message: 'Processing domains...',
      },
    };
    
    const frontendFormat = {
      structure: 'Nested data object',
      fields: {
        type: 'string',
        campaignId: 'string',
        data: {
          progress: 'number',
          phase: 'string',
          status: 'string',
          error: 'string',
          domains: 'string[]',
          validationResults: 'unknown[]',
        },
        message: 'string',
      },
      example: {
        type: 'progress',
        campaignId: 'campaign-123',
        data: {
          progress: 50,
          phase: 'DomainGeneration',
          status: 'InProgress',
        },
        message: 'Processing domains...',
      },
    };
    
    const criticalMismatches = [
      'Field casing: Backend uses CamelCase (CampaignID) vs frontend camelCase (campaignId)',
      'Structure: Backend uses flat structure vs frontend expects nested data object',
      'Type definitions: Backend uses Go types vs TypeScript types',
      'Field mapping: Backend Progress -> frontend data.progress transformation required',
    ];
    
    const recommendations = [
      'Implement consistent field naming convention (prefer camelCase)',
      'Standardize on either flat or nested structure across backend/frontend',
      'Add message transformation layer in WebSocket service',
      'Create TypeScript interfaces that match Go struct definitions',
      'Implement field validation on both sides',
    ];
    
    return {
      backendFormat,
      frontendFormat,
      criticalMismatches,
      recommendations,
    };
  }

  stopDiagnostic(): void {
    // Restore original methods
    if (this.originalConnectToCampaign) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (websocketService as any).connectToCampaign = this.originalConnectToCampaign;
    }
    
    console.log('[Message Format Diagnostic] Diagnostic stopped');
  }
}

// Export singleton instance
export const messageFormatDiagnostic = new MessageFormatDiagnostic();