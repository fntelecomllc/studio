/**
 * Example Campaign Component using Simple WebSocket
 * 
 * Demonstrates how easy it is to use the simplified WebSocket service
 * compared to the complex current implementation.
 */

import React, { useState } from 'react';
import { useCampaignWebSocket, useCampaignMessages } from '@/lib/hooks/useWebSocket';
import { logger } from '@/lib/utils/logger';
import { CampaignWebSocketIndicator } from '@/components/websocket/WebSocketStatus.simple';
import type { WebSocketMessage } from '@/lib/services/websocketService.simple';

interface CampaignProgressProps {
  campaignId: string;
}

export function SimpleCampaignProgress({ campaignId }: CampaignProgressProps) {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Unknown');
  const [phase, setPhase] = useState('');

  // Handle campaign messages with automatic connection management
  const handleMessage = (message: WebSocketMessage) => {
    logger.debug('Received campaign message', {
      component: 'SimpleCampaignProgress',
      campaignId,
      messageType: message.type,
      messageData: message.data
    });
    
    switch (message.type) {
      case 'campaign_progress':
        if (message.data && typeof message.data === 'object') {
          const data = message.data as { progress?: number; status?: string; phase?: string };
          if (data.progress !== undefined) {
            setProgress(data.progress);
          }
          if (data.status) {
            setStatus(data.status);
          }
          if (data.phase) {
            setPhase(data.phase);
          }
        }
        break;
        
      case 'campaign_complete':
        setProgress(100);
        setStatus('Completed');
        break;
        
      case 'campaign_error':
        setStatus('Failed');
        break;
    }
  };

  // Simple hook usage - handles all connection management
  const { isConnected, isConnecting, error } = useCampaignWebSocket(campaignId, {
    onMessage: handleMessage
  });

  // Alternative: Use message filtering hook for specific message types
  const { 
    messages: _progressMessages, 
    latestMessage,
    messageCount 
  } = useCampaignMessages(campaignId, ['campaign_progress', 'campaign_complete']);

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Campaign Progress</h3>
        <CampaignWebSocketIndicator campaignId={campaignId} />
      </div>

      {/* Connection Status */}
      <div className="mb-4 text-sm text-gray-600">
        {isConnecting && 'Connecting to real-time updates...'}
        {isConnected && 'Receiving live updates'}
        {error && (
          <div className="text-red-600">
            Connection error: {error.message}
          </div>
        )}
      </div>

      {/* Progress Display */}
      <div className="space-y-4">
        <div>
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>Progress</span>
            <span>{progress.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Status:</span>
            <span className="ml-2 font-medium">{status}</span>
          </div>
          <div>
            <span className="text-gray-600">Phase:</span>
            <span className="ml-2 font-medium">{phase || 'N/A'}</span>
          </div>
        </div>

        {/* Message Debug Info */}
        <details className="text-xs text-gray-500">
          <summary className="cursor-pointer">Debug Info ({messageCount} messages)</summary>
          <div className="mt-2 space-y-1">
            {latestMessage && (
              <div>
                <strong>Latest:</strong> {latestMessage.type} at {latestMessage.timestamp}
              </div>
            )}
            <div>Connection: {isConnected ? 'Active' : 'Inactive'}</div>
          </div>
        </details>
      </div>
    </div>
  );
}

/**
 * Example Campaigns List Component
 */
interface CampaignsListProps {
  campaigns: Array<{ id: string; name: string; status: string }>;
}

export function SimpleCampaignsList({ campaigns }: CampaignsListProps) {
  const [campaignUpdates, setCampaignUpdates] = useState<Record<string, WebSocketMessage>>({});

  // Single global connection for all campaign updates
  const handleGlobalMessage = (message: WebSocketMessage) => {
    if (message.campaignId && message.type === 'campaign_progress') {
      setCampaignUpdates(prev => ({
        ...prev,
        [message.campaignId!]: message
      }));
    }
  };

  // Simple global WebSocket connection
  const { isConnected } = useCampaignWebSocket(null, {
    onMessage: handleGlobalMessage
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Campaigns</h2>
        <div className="text-sm text-gray-600">
          Real-time updates: {isConnected ? '✅ Active' : '❌ Inactive'}
        </div>
      </div>

      <div className="grid gap-4">
        {campaigns.map(campaign => {
          const liveData = campaignUpdates[campaign.id] as { progress?: number; status?: string } | undefined;
          const progress = liveData?.progress || 0;
          
          return (
            <div key={campaign.id} className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium">{campaign.name}</h3>
                <CampaignWebSocketIndicator campaignId={campaign.id} />
              </div>
              
              <div className="text-sm text-gray-600 mb-2">
                Status: {liveData?.status || campaign.status}
              </div>
              
              {progress > 0 && (
                <div>
                  <div className="w-full bg-gray-200 rounded-full h-1">
                    <div 
                      className="bg-green-600 h-1 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {progress.toFixed(1)}% complete
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default SimpleCampaignProgress;
