"use client";

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/shared/PageHeader';
import StrictProtectedRoute from '@/components/auth/StrictProtectedRoute';
import { ConditionalAccess } from '@/components/auth/ProtectedRoute';
import type { CampaignViewModel, CampaignsListResponse, CampaignDeleteResponse, CampaignOperationResponse } from '@/lib/types';
import { PlusCircle, Briefcase, CheckCircle, AlertTriangle, Clock, PauseCircle, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useState, useCallback, useRef, lazy, Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getCampaigns, deleteCampaign, pauseCampaign, resumeCampaign, cancelCampaign as stopCampaign } from '@/lib/services/campaignService.production';
import { normalizeStatus, isActiveStatus } from '@/lib/utils/statusMapping';
import { adaptWebSocketMessage } from '@/lib/utils/websocketMessageAdapter';
import type { WebSocketMessage } from '@/lib/websocket/enhancedWebSocketClient';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useOptimisticUpdate, useLoadingState, useStateSubscription } from '@/lib/state/stateManager';
import { transformCampaignsToViewModels, mergeCampaignApiUpdate } from '@/lib/utils/campaignTransforms';

// PERFORMANCE: Lazy load campaign components for better bundle splitting
const CampaignListItem = lazy(() => import('@/components/campaigns/CampaignListItem'));
const CampaignProgressMonitor = lazy(() => import('@/components/campaigns/CampaignProgressMonitor'));

// PERFORMANCE: Loading component for lazy-loaded components
const ComponentLoader = () => (
  <div className="space-y-4">
    <Skeleton className="h-24 w-full" />
  </div>
);

function CampaignsPageContent() {
  const [campaigns, setCampaigns] = useState<CampaignViewModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "active" | "completed" | "failed" | "paused">("all");
  const [wsConnected, setWsConnected] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const { applyUpdate, confirmUpdate, rollbackUpdate } = useOptimisticUpdate();
  const { setLoading: setGlobalLoading, isLoading: isGlobalLoading } = useLoadingState();

  // MEMORY LEAK FIX: Add AbortController for API request cancellation
  const abortControllerRef = useRef<AbortController | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);


  // MEMORY LEAK FIX: WebSocket connection management with proper cleanup
  useEffect(() => {
    let wsCleanup: (() => void) | null = null;

    const connectWebSocket = async () => {
      try {
        // Import the WebSocket service dynamically to avoid SSR issues
        const { websocketService } = await import('@/lib/websocket/enhancedWebSocketClient');
        
        if (!isMountedRef.current) return;
        
        // Connect to all campaigns updates
        wsCleanup = websocketService.connectToAllCampaigns(
          (standardMessage: WebSocketMessage) => {
            if (!isMountedRef.current) return;
            
            console.log('[CampaignsPage] WebSocket message received:', standardMessage);
            
            // Convert to legacy format for backward compatibility
            const message = adaptWebSocketMessage(standardMessage);
            
            // Handle different message types
            switch (message.type) {
              case 'progress':
                // Update campaign progress
                if (message.campaignId) {
                  setCampaigns(prev => prev.map(campaign =>
                    campaign.id === message.campaignId
                      ? { ...campaign, progressPercentage: message.data.progress || campaign.progressPercentage }
                      : campaign
                  ));
                }
                break;
                
              case 'phase_complete':
                // Update campaign status and phase
                if (message.campaignId && message.data.status) {
                  setCampaigns(prev => prev.map(campaign =>
                    campaign.id === message.campaignId
                      ? { 
                          ...campaign, 
                          status: normalizeStatus(message.data.status),
                          currentPhase: message.data.phase as CampaignViewModel['currentPhase']
                        }
                      : campaign
                  ));
                }
                break;
                
              case 'error':
                // Handle campaign errors
                if (message.campaignId && message.data && typeof message.data === 'object' && 'error' in message.data) {
                  setCampaigns(prev => prev.map(campaign =>
                    campaign.id === message.campaignId
                      ? { ...campaign, errorMessage: String((message.data as { error: unknown }).error) }
                      : campaign
                  ));
                }
                break;
            }
          },
          (error) => {
            console.error('WebSocket error:', error);
            if (isMountedRef.current) {
              setWsConnected(false);
            }
          }
        );
        
        setWsConnected(true);

      } catch (error) {
        console.error('Failed to connect WebSocket:', error);
        if (isMountedRef.current) {
          setWsConnected(false);
        }
      }
    };

    connectWebSocket();

    return () => {
      if (wsCleanup) {
        wsCleanup();
      }
    };
  }, []);

  // MEMORY LEAK FIX: Track component mount status
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Subscribe to campaign state changes
  useStateSubscription('campaigns', (updatedCampaigns) => {
    console.log('[CampaignsPage] State subscription triggered with:', updatedCampaigns);
    if (Array.isArray(updatedCampaigns)) {
      setCampaigns(updatedCampaigns);
    }
  });

  const loadCampaignsData = useCallback(async (showLoadingSpinner = true, signal?: AbortSignal) => {
    console.log(`[CampaignsPage] loadCampaignsData called with showLoadingSpinner: ${showLoadingSpinner}`);
    
    // MEMORY LEAK FIX: Check if component is still mounted
    if (!isMountedRef.current) {
      console.log('[CampaignsPage] Component unmounted, skipping load');
      return;
    }
    
    // INFINITE LOOP PREVENTION: Check if already loading to prevent concurrent calls
    if (isGlobalLoading('campaigns_load')) {
      console.log('[CampaignsPage] Already loading campaigns, skipping duplicate call');
      return;
    }
    
    if (showLoadingSpinner && isMountedRef.current) setLoading(true);
    setGlobalLoading('campaigns_load', true, 'Loading campaigns');
    
    try {
      // MEMORY LEAK FIX: Pass AbortSignal to API call (if getCampaigns supports it)
      const response: CampaignsListResponse = await getCampaigns();
      
      // MEMORY LEAK FIX: Check if request was aborted or component unmounted
      if (signal?.aborted || !isMountedRef.current) {
        console.log('[CampaignsPage] Request aborted or component unmounted');
        return;
      }

      if (response.status === 'success' && Array.isArray(response.data)) {
        console.log(`[CampaignsPage] Successfully loaded ${response.data.length} campaigns`);
        if (isMountedRef.current) {
          setCampaigns(transformCampaignsToViewModels(response.data));
        }
      } else {
        console.warn('[CampaignsPage] Failed to load campaigns:', response.message);
        if (isMountedRef.current) {
          setCampaigns([]);
          toast({
            title: "Error Loading Campaigns",
            description: response.message || "Failed to load campaigns.",
            variant: "destructive"
          });
        }
      }
    } catch (error: unknown) {
      // MEMORY LEAK FIX: Don't update state if component unmounted or request aborted
      if (signal?.aborted || !isMountedRef.current) {
        console.log('[CampaignsPage] Request aborted or component unmounted during error handling');
        return;
      }
      
      console.error('[CampaignsPage] Error loading campaigns:', error);
      if (isMountedRef.current) {
        setCampaigns([]);
        const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred.";
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive"
        });
      }
    } finally {
      if (isMountedRef.current) {
        if (showLoadingSpinner) setLoading(false);
        setGlobalLoading('campaigns_load', false);
      }
    }
  }, [toast, isGlobalLoading, setGlobalLoading]); // Fixed: Added missing dependencies


  useEffect(() => {
    console.log('[CampaignsPage] Initial load effect triggered');
    
    // MEMORY LEAK FIX: Create AbortController for this effect
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
    // Initial load
    loadCampaignsData(true, abortController.signal);
    
    // MEMORY LEAK FIX: Set up interval with proper cleanup - reduced frequency for better performance
    const intervalId = setInterval(() => {
      if (!isMountedRef.current || abortController.signal.aborted) {
        console.log('[CampaignsPage] Interval stopped due to unmount or abort');
        clearInterval(intervalId);
        return;
      }
      console.log('[CampaignsPage] Interval refresh triggered');
      loadCampaignsData(false, abortController.signal);
    }, 30000); // FIXED: Changed from 5 seconds to 30 seconds to reduce refresh frequency
    
    intervalRef.current = intervalId;
    
    return () => {
      console.log('[CampaignsPage] Cleaning up interval and aborting requests');
      // MEMORY LEAK FIX: Clear interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      // MEMORY LEAK FIX: Abort ongoing requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [loadCampaignsData]);

  // MEMORY LEAK FIX: Cleanup on unmount
  useEffect(() => {
    return () => {
      // Cancel any ongoing API requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      // Clear any running intervals
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);


  const handleDeleteCampaign = async (campaignId: string) => {
    if (!hasPermission('campaigns:delete')) {
      toast({
        title: "Permission Denied",
        description: "You don't have permission to delete campaigns.",
        variant: "destructive"
      });
      return;
    }

    setActionLoading(prev => ({ ...prev, [`delete-${campaignId}`]: true }));
    setGlobalLoading(`delete_campaign_${campaignId}`, true, 'Deleting campaign');

    // Apply optimistic update
    const campaign = campaigns.find(c => c.id === campaignId);
    const updateId = await applyUpdate({
      type: 'DELETE',
      entityType: 'campaigns',
      entityId: campaignId,
      optimisticData: null,
      originalData: campaign,
      rollbackFn: () => {
        if (campaign) {
          setCampaigns(prev => [...prev, campaign]);
        }
      },
      retryFn: () => handleDeleteCampaign(campaignId)
    });

    // Apply optimistic UI update
    setCampaigns(prev => prev.filter(c => c.id !== campaignId));

    try {
      // Call deleteCampaign with just campaignId
      const response: CampaignDeleteResponse = await deleteCampaign(campaignId);
      if (response.status === 'success') {
        await confirmUpdate(updateId);
        toast({
          title: "Campaign Deleted",
          description: response.message || "Campaign successfully deleted."
        });
      } else {
        await rollbackUpdate(updateId, response.message);
        toast({
          title: "Error Deleting Campaign",
          description: response.message || "Failed to delete.",
          variant: "destructive"
        });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Could not delete campaign.";
      await rollbackUpdate(updateId, errorMessage);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setActionLoading(prev => ({ ...prev, [`delete-${campaignId}`]: false }));
      setGlobalLoading(`delete_campaign_${campaignId}`, false);
    }
  };

  const handleCampaignControl = async (campaignId: string, action: 'pause' | 'resume' | 'stop') => {
    const requiredPermission = `campaigns:${action}`;
    if (!hasPermission(requiredPermission)) {
      toast({
        title: "Permission Denied",
        description: `You don't have permission to ${action} campaigns.`,
        variant: "destructive"
      });
      return;
    }

    const actionKey = `${action}-${campaignId}`;
    setActionLoading(prev => ({ ...prev, [actionKey]: true }));
    setGlobalLoading(`${action}_campaign_${campaignId}`, true, `${action}ing campaign`);

    let apiCall: (id: string) => Promise<CampaignOperationResponse>;
    if (action === 'pause') apiCall = pauseCampaign;
    else if (action === 'resume') apiCall = resumeCampaign;
    else apiCall = stopCampaign;

    // Apply optimistic update
    const campaign = campaigns.find(c => c.id === campaignId);
    const optimisticStatus = action === 'pause' ? 'paused' : action === 'resume' ? 'running' : 'cancelled';
    const optimisticData = campaign ? { ...campaign, status: normalizeStatus(optimisticStatus) } : null;

    const updateId = await applyUpdate({
      type: 'UPDATE',
      entityType: 'campaigns',
      entityId: campaignId,
      optimisticData,
      originalData: campaign,
      rollbackFn: () => {
        if (campaign) {
          setCampaigns(prev => prev.map(c => c.id === campaignId ? campaign : c));
        }
      },
      retryFn: () => handleCampaignControl(campaignId, action)
    });

    // Apply optimistic UI update
    if (optimisticData) {
      setCampaigns(prev => prev.map(c => c.id === campaignId ? optimisticData : c));
    }

    try {
      // Call the control function with just campaignId
      const response = await apiCall(campaignId);
      if (response.status === 'success' && response.data) {
        await confirmUpdate(updateId, response.data);
        toast({ title: `Campaign ${action}ed`, description: response.message });
        setCampaigns(prev => prev.map(c => c.id === campaignId ? mergeCampaignApiUpdate(c, response.data || {}) : c));
      } else {
        await rollbackUpdate(updateId, response.message);
        toast({ title: `Error ${action}ing campaign`, description: response.message, variant: "destructive"});
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : `Failed to ${action} campaign`;
      await rollbackUpdate(updateId, errorMessage);
      toast({ title: `Error ${action}ing campaign`, description: errorMessage, variant: "destructive"});
    } finally {
      setActionLoading(prev => ({ ...prev, [actionKey]: false }));
      setGlobalLoading(`${action}_campaign_${campaignId}`, false);
    }
  };


  const filteredCampaigns = campaigns.filter(campaign => {
    // Normalize campaign status to ensure consistency
    const status = normalizeStatus(campaign.status);
    
    if (activeTab === "active") return isActiveStatus(status);
    if (activeTab === "paused") return status === "paused";
    if (activeTab === "completed") return status === "completed";
    if (activeTab === "failed") return status === "failed";
    return true; // 'all'
  });

  const countActive = campaigns.filter(c => isActiveStatus(normalizeStatus(c.status))).length;
  const countPaused = campaigns.filter(c => normalizeStatus(c.status) === "paused").length;
  const countCompleted = campaigns.filter(c => normalizeStatus(c.status) === "completed").length;
  const countFailed = campaigns.filter(c => normalizeStatus(c.status) === "failed").length;


  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Oversee all your domain intelligence and lead generation initiatives."
        icon={Briefcase}
        actionButtons={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              {wsConnected ? (
                <Badge variant="secondary" className="text-xs">
                  <Wifi className="mr-1 h-3 w-3" />
                  Live Updates
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs">
                  <WifiOff className="mr-1 h-3 w-3" />
                  Offline
                </Badge>
              )}
            </div>
            <ConditionalAccess requiredPermissions={['campaigns:create']}>
              <Button asChild>
                <Link href="/campaigns/new">
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Create New Campaign
                </Link>
              </Button>
            </ConditionalAccess>
          </div>
        }
      />

      {!wsConnected && (
        <Alert className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Real-time updates are currently unavailable. Campaign data may not reflect the latest changes.
          </AlertDescription>
        </Alert>
      )}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "all" | "active" | "completed" | "failed" | "paused")} className="mb-6">
        <TabsList>
          <TabsTrigger value="all">All ({campaigns.length})</TabsTrigger>
          <TabsTrigger value="active"> <Clock className="mr-2 h-4 w-4 text-blue-500"/> Active ({countActive}) </TabsTrigger>
          <TabsTrigger value="paused"> <PauseCircle className="mr-2 h-4 w-4 text-orange-500"/> Paused ({countPaused}) </TabsTrigger>
          <TabsTrigger value="completed"> <CheckCircle className="mr-2 h-4 w-4 text-green-500"/> Completed ({countCompleted}) </TabsTrigger>
          <TabsTrigger value="failed"> <AlertTriangle className="mr-2 h-4 w-4 text-destructive"/> Failed ({countFailed}) </TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
         <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="shadow-md">
              <CardHeader><Skeleton className="h-6 w-3/4 mb-2" /><Skeleton className="h-4 w-1/2" /></CardHeader>
              <CardContent className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-10 w-2/3" /></CardContent>
              <CardFooter><Skeleton className="h-4 w-1/4" /></CardFooter>
            </Card>
          ))}
        </div>
      ) :
      filteredCampaigns.length === 0 ? (
         <div className="text-center py-10 border-2 border-dashed rounded-lg mt-6">
            <Briefcase className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-2 text-lg font-medium">
                {activeTab === "all" ? "No campaigns found" : `No ${activeTab} campaigns found`}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
                {activeTab === "all" ? "Get started by creating your first campaign." : `There are no campaigns currently in the "${activeTab}" state.`}
            </p>
            <div className="mt-6">
              <Button asChild><Link href="/campaigns/new"><PlusCircle className="mr-2 h-4 w-4" /> Create New Campaign</Link></Button>
            </div>
          </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredCampaigns.map(campaign => (
            <Suspense key={campaign.id} fallback={<ComponentLoader />}>
              <CampaignListItem
                  campaign={campaign}
                  onDeleteCampaign={() => handleDeleteCampaign(campaign.id)}
                  onPauseCampaign={() => handleCampaignControl(campaign.id, 'pause')}
                  onResumeCampaign={() => handleCampaignControl(campaign.id, 'resume')}
                  onStopCampaign={() => handleCampaignControl(campaign.id, 'stop')}
                  isActionLoading={actionLoading}
              />
            </Suspense>
          ))}
        </div>
      )}
     {/* Campaign Progress Monitors for active campaigns */}
     {campaigns.filter(c => isActiveStatus(normalizeStatus(c.status))).map(campaign => {
       console.log(`[CampaignsPage] Rendering progress monitor for campaign ${campaign.id}`);
       return (
         <div key={`monitor-${campaign.id}`} className="mb-4">
           <Suspense fallback={<ComponentLoader />}>
             <CampaignProgressMonitor
               campaign={campaign}
               onCampaignUpdate={(updates) => {
                 console.log(`[CampaignsPage] Progress monitor update for ${campaign.id}:`, updates);
                 // INFINITE LOOP PREVENTION: Avoid triggering state updates that cause re-renders
                 setCampaigns(prev => prev.map(c =>
                   c.id === campaign.id ? { ...c, ...updates } : c
                 ));
               }}
             />
           </Suspense>
         </div>
       );
     })}
   </>
 );
}

export default function CampaignsPage() {
 return (
   <StrictProtectedRoute
     requiredPermissions={['campaigns:read']}
     redirectTo="/login"
   >
     <CampaignsPageContent />
   </StrictProtectedRoute>
 );
}
