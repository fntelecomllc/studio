/**
 * Simple WebSocket Status Component
 * 
 * Provides a clean, simple status indicator for WebSocket connections
 * without the complexity of the current implementation.
 */

import React from 'react';
import { useWebSocketStatus } from '@/lib/hooks/useWebSocket';

interface WebSocketStatusProps {
  className?: string;
  showDetails?: boolean;
  campaignId?: string;
}

export function WebSocketStatus({
  className = '',
  showDetails = false,
  campaignId
}: WebSocketStatusProps): React.ReactElement {
  const { status, isAnyConnected, getStatus } = useWebSocketStatus();

  // Determine status for specific campaign or overall
  const isConnected = (campaignId !== undefined) ? getStatus(campaignId) : isAnyConnected;
  
  const statusColor = isConnected ? 'text-green-600' : 'text-red-600';
  const statusIcon = isConnected ? '●' : '●';
  const statusText = isConnected ? 'Connected' : 'Disconnected';

  if (showDetails === false) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className={`${statusColor} text-sm`} title="WebSocket Status">
          {statusIcon}
        </span>
        <span className="text-sm text-gray-600">
          {statusText}
        </span>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-2">
        <span className={`${statusColor} text-sm font-medium`}>
          {statusIcon} WebSocket Status
        </span>
        <span className={`text-sm ${statusColor}`}>
          {statusText}
        </span>
      </div>
      
      {(showDetails === true && Object.keys(status).length > 0) && (
        <div className="text-xs text-gray-500 space-y-1">
          <div>Active Connections:</div>
          {Object.entries(status).map(([id, connected]) => (
            <div key={id} className="flex items-center gap-2 ml-2">
              <span className={connected === true ? 'text-green-600' : 'text-red-600'}>
                {connected === true ? '●' : '●'}
              </span>
              <span className="font-mono text-xs">
                {id.length > 8 ? `${id.slice(0, 8)}...` : id}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Simple WebSocket indicator for campaign pages
 */
interface CampaignWebSocketIndicatorProps {
  campaignId: string;
  className?: string;
}

export function CampaignWebSocketIndicator({
  campaignId,
  className = ''
}: CampaignWebSocketIndicatorProps): React.ReactElement {
  const { getStatus } = useWebSocketStatus();
  const isConnected = getStatus(campaignId);

  return (
    <div 
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${className}`}
      style={{
        backgroundColor: isConnected === true ? '#dcfce7' : '#fee2e2',
        color: isConnected === true ? '#16a34a' : '#dc2626'
      }}
      title={`WebSocket ${isConnected === true ? 'Connected' : 'Disconnected'}`}
    >
      <span className="w-2 h-2 rounded-full" style={{
        backgroundColor: isConnected === true ? '#16a34a' : '#dc2626'
      }} />
      <span>
        {isConnected === true ? 'Live' : 'Offline'}
      </span>
    </div>
  );
}

export default WebSocketStatus;
