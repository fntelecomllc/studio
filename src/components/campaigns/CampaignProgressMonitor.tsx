"use client";

import React, { useEffect, useState, useRef, useCallback, memo, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertCircle, CheckCircle, Clock, Pause, Wifi, WifiOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { websocketService } from '@/lib/websocket/enhancedWebSocketClient';
import type { CampaignViewModel, CampaignPhase, CampaignStatus } from '@/lib/types';
import type { WebSocketMessage } from '@/lib/websocket/enhancedWebSocketClient';
import { normalizeStatus, getStatusColor } from '@/lib/utils/statusMapping';
import { adaptWebSocketMessage } from '@/lib/utils/websocketMessageAdapter';

interface CampaignProgressMonitorProps {
  campaign: CampaignViewModel;
  onCampaignUpdate?: (updatedCampaign: Partial<CampaignViewModel>) => void;
  onDomainReceived?: (domain: string) => void;
}

interface ConnectionHealth {
  isConnected: boolean;
  lastHeartbeat: Date | null;
}

// Memoized status icon component for better performance
const StatusIcon = memo(({ status }: { status: CampaignStatus }) => {
  switch (status) {
    case 'running': return <Clock className="h-4 w-4" />;
    case 'completed': return <CheckCircle className="h-4 w-4" />;
    case 'failed': return <AlertCircle className="h-4 w-4" />;
    case 'paused': return <Pause className="h-4 w-4" />;
    default: return <Clock className="h-4 w-4" />;
  }
});

StatusIcon.displayName = 'StatusIcon';

// Memoized connection status badge for better performance
const ConnectionBadge = memo(({ isConnected }: { isConnected: boolean }) => {
  if (isConnected) {
    return (
      <Badge variant="outline" className="text-green-600 border-green-600">
        <Wifi className="h-3 w-3 mr-1" />
        Connected
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-red-600 border-red-600">
      <WifiOff className="h-3 w-3 mr-1" />
      Disconnected
    </Badge>
  );
});

ConnectionBadge.displayName = 'ConnectionBadge';

// Memoized main component for optimal performance
const CampaignProgressMonitor = memo(({
  campaign,
  onCampaignUpdate,
  onDomainReceived
}: CampaignProgressMonitorProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const cleanupRef = useRef<(() => void) | null>(null);
  
  const [connectionHealth, setConnectionHealth] = useState<ConnectionHealth>({
    isConnected: false,
    lastHeartbeat: null
  });

  const [realtimeData, setRealtimeData] = useState({
    domainsGenerated: 0,
    currentProgress: campaign.progress ?? 0,
    currentStatus: normalizeStatus(campaign.status),
    currentPhase: campaign.currentPhase ?? 'Idle',
    lastActivity: new Date(),
    errors: [] as string[]
  });

  // Memoize connection condition to prevent unnecessary effect triggers
  const shouldConnect = useMemo(() => {
    return campaign.currentPhase !== 'Idle' &&
           campaign.currentPhase !== 'Completed' &&
           campaign.phaseStatus === 'InProgress';
  }, [campaign.currentPhase, campaign.phaseStatus]);

  // Memoize campaign key properties to prevent unnecessary effect triggers
  const campaignKey = useMemo(() => ({
    id: campaign.id,
    currentPhase: campaign.currentPhase,
    phaseStatus: campaign.phaseStatus,
    status: campaign.status
  }), [campaign.id, campaign.currentPhase, campaign.phaseStatus, campaign.status]);

  // Optimized WebSocket message handler with stable dependencies
  const handleWebSocketMessage = useCallback((message: import('@/lib/websocket/enhancedWebSocketClient').WebSocketMessage) => {
    setConnectionHealth(prev => ({ ...prev, lastHeartbeat: new Date() }));
    
    console.log(`[CampaignProgressMonitor] Received WebSocket message:`, message);

    switch (message.type) {
      case 'subscription_confirmed':
        console.log(`[DEBUG] Campaign subscription confirmed for ${message.campaignId}`);
        toast({
          title: "Campaign Subscription Active",
          description: `Now monitoring campaign ${campaignKey.id} for real-time updates.`
        });
        break;

      case 'domain_generated': {
        const domainData = message.data as { domains?: string[] };
        const domains = domainData.domains;
        if (domains !== undefined && domains.length > 0) {
          setRealtimeData(prev => ({
            ...prev,
            domainsGenerated: prev.domainsGenerated + domains.length,
            lastActivity: new Date()
          }));
          domains.forEach((domain: string) => {
            if (onDomainReceived !== undefined) {
              onDomainReceived(domain);
            }
          });
        }
        break;
      }

      case 'progress': {
        const progressValue = message.data.progress;
        if (typeof progressValue === 'number') {
          setRealtimeData(prev => ({
            ...prev,
            currentProgress: progressValue,
            lastActivity: new Date()
          }));
          onCampaignUpdate?.({ progress: progressValue });
        }
        break;
      }

      case 'phase_complete':
        if (message.data.phase !== undefined && message.data.status !== undefined) {
          setRealtimeData(prev => ({
            ...prev,
            currentPhase: message.data.phase as CampaignPhase,
            currentStatus: normalizeStatus(message.data.status),
            lastActivity: new Date()
          }));
          onCampaignUpdate?.({
            currentPhase: message.data.phase as CampaignPhase,
            status: normalizeStatus(message.data.status),
            progress: 100
          });
          toast({
            title: "Phase Completed",
            description: `${typeof message.data.phase === 'string' ? message.data.phase : 'Unknown'} phase has completed successfully.`
          });
        }
        break;

      case 'error': {
        const errorData = message.data as { error?: string };
        const errorMsg = errorData.error ?? message.message ?? 'Unknown error occurred';
        setRealtimeData(prev => ({
          ...prev,
          errors: [...prev.errors.slice(-4), String(errorMsg)], // Keep last 5 errors
          lastActivity: new Date()
        }));
        toast({
          title: "Campaign Error",
          description: String(errorMsg),
          variant: "destructive"
        });
        break;
      }

      default:
        console.log('Unknown WebSocket message type:', message.type);
    }
  }, [campaignKey.id, toast, onDomainReceived, onCampaignUpdate]);

  // Optimized WebSocket connection effect with minimal dependencies
  useEffect(() => {
    console.log(`[DEBUG] useEffect triggered for campaign ${campaignKey.id} - shouldConnect: ${shouldConnect}, phase: ${campaignKey.currentPhase}, status: ${campaignKey.status}`);
    
    if (shouldConnect && user !== null) {
      // Use the websocketService
      cleanupRef.current = websocketService.connectToCampaign(
        campaignKey.id,
        (standardMessage: WebSocketMessage) => {
          // Convert to legacy format
          const message = adaptWebSocketMessage(standardMessage);
          handleWebSocketMessage(message);
        },
        (error) => {
          console.error('WebSocket error:', error);
          setConnectionHealth({ isConnected: false, lastHeartbeat: null });
          toast({
            title: "Connection Error",
            description: "Lost connection to real-time updates.",
            variant: "destructive"
          });
        }
      );
      
      setConnectionHealth({ isConnected: true, lastHeartbeat: new Date() });
      
      toast({
        title: "Real-time Monitoring Connected",
        description: "Now receiving live updates for this campaign."
      });
    }

    return () => {
      console.log(`[DEBUG] useEffect cleanup for campaign ${campaignKey.id}`);
      if (cleanupRef.current !== null) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      setConnectionHealth({ isConnected: false, lastHeartbeat: null });
    };
  }, [campaignKey.id, campaignKey.currentPhase, campaignKey.phaseStatus, campaignKey.status, shouldConnect, user, toast, handleWebSocketMessage]);

  // Optimized campaign state sync effect with memoized dependencies
  useEffect(() => {
    console.log(`[CampaignProgressMonitor] Campaign prop changed for ${campaignKey.id}:`, {
      progress: campaign.progress,
      status: campaign.status,
      currentPhase: campaign.currentPhase
    });
    setRealtimeData(prev => ({
      ...prev,
      currentProgress: campaign.progress ?? 0,
      currentStatus: normalizeStatus(campaign.status),
      currentPhase: campaign.currentPhase ?? 'Idle'
    }));
  }, [campaignKey.id, campaign.progress, campaign.status, campaign.currentPhase]);

  // Memoize status color computation
  const statusColor = useMemo(() => getStatusColor(realtimeData.currentStatus), [realtimeData.currentStatus]);

  // Memoize last activity time formatting to prevent re-computation
  const formattedLastActivity = useMemo(() => {
    return realtimeData.lastActivity.toLocaleTimeString();
  }, [realtimeData.lastActivity]);

  // Memoize heartbeat time formatting
  const formattedHeartbeat = useMemo(() => {
    return connectionHealth.lastHeartbeat !== null ? connectionHealth.lastHeartbeat.toLocaleTimeString() : undefined;
  }, [connectionHealth.lastHeartbeat]);

  // Remove the local getStatusColor function since we're importing it from utils

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Real-time Progress Monitor</CardTitle>
          <div className="flex items-center gap-2">
            <ConnectionBadge isConnected={connectionHealth.isConnected} />
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Current Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${statusColor}`} />
            <span className="font-medium">{realtimeData.currentPhase}</span>
            <StatusIcon status={realtimeData.currentStatus} />
          </div>
          <Badge variant="secondary">
            {realtimeData.currentStatus}
          </Badge>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Progress</span>
            <span>{realtimeData.currentProgress}%</span>
          </div>
          <Progress value={realtimeData.currentProgress} className="h-2" />
        </div>

        {/* Real-time Stats */}
        {realtimeData.currentPhase === 'domain_generation' && (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Domains Generated:</span>
              <div className="font-mono font-medium">{realtimeData.domainsGenerated}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Last Activity:</span>
              <div className="font-mono text-xs">
                {formattedLastActivity}
              </div>
            </div>
          </div>
        )}

        {/* Connection Health */}
        {connectionHealth.lastHeartbeat !== null && (
          <div className="text-xs text-muted-foreground">
            Last heartbeat: {formattedHeartbeat}
          </div>
        )}

        {/* Recent Errors */}
        {realtimeData.errors.length > 0 && (
          <div className="space-y-1">
            <span className="text-sm font-medium text-red-600">Recent Errors:</span>
            {realtimeData.errors.slice(-3).map((error, index) => (
              <div key={index} className="text-xs text-red-600 bg-red-50 p-2 rounded">
                {error}
              </div>
            ))}
          </div>
        )}

        {/* Connection Status Message */}
        {!shouldConnect && (
          <div className="text-sm text-muted-foreground text-center py-2">
            Real-time monitoring is available when campaign is actively running.
          </div>
        )}
      </CardContent>
    </Card>
  );
});

CampaignProgressMonitor.displayName = 'CampaignProgressMonitor';

export default CampaignProgressMonitor;