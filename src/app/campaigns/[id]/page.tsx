"use client";

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import PageHeader from '@/components/shared/PageHeader';
import CampaignProgress from '@/components/campaigns/CampaignProgress';
import ContentSimilarityView from '@/components/campaigns/ContentSimilarityView';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Campaign, CampaignStatus, StartCampaignPhasePayload, CampaignDomainDetail, DomainActivityStatus, CampaignValidationItem, GeneratedDomain, CampaignType } from '@/lib/types';
import { CAMPAIGN_PHASES_ORDERED, getNextPhase, getFirstPhase } from '@/lib/constants';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Briefcase, Dna, Network, Globe, Users2, Play, RefreshCw, CheckCircle, Download, PauseCircle, PlayCircle, StopCircle, HelpCircle, Search, ShieldQuestion, ExternalLink, XCircle, Clock, Loader2, ChevronLeft, ChevronRight, Percent } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { getCampaignById, startCampaign as startCampaignPhase, pauseCampaign, resumeCampaign, cancelCampaign as stopCampaign, getGeneratedDomains as getGeneratedDomainsForCampaign, getDNSValidationResults as getDnsCampaignDomains, getHTTPKeywordResults as getHttpCampaignItems } from '@/lib/services/campaignService.production';
import { websocketService } from '@/lib/services/websocketService.simple';
import PhaseGateButton from '@/components/campaigns/PhaseGateButton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


const phaseIcons: Record<CampaignType, LucideIcon> = {
  domain_generation: Dna,
  dns_validation: Network,
  http_keyword_validation: Globe,
};

const phaseDisplayNames: Record<CampaignType, string> = {
  domain_generation: "Domain Generation",
  dns_validation: "DNS Validation",
  http_keyword_validation: "HTTP Validation",
};

// Updated helper to get status based on item data
const getDomainStatusFromItem = (itemStatus: CampaignStatus | string | undefined): DomainActivityStatus => {
  switch (itemStatus?.toLowerCase()) {
    case 'resolved': // For DNS
    case 'validated': // General term, or from HTTP if it uses this
    case 'lead_valid': // For HTTP/Keyword
    case 'http_valid_no_keywords': // For HTTP/Keyword
    case 'succeeded': // General completion from item
      return 'validated';
    case 'scanned': // Specific for LeadGen if leads were found
        return 'scanned';
    case 'no_leads': // Specific for LeadGen
        return 'no_leads';
    case 'unresolved': // For DNS
    case 'invalid_http_response_error': // For HTTP/Keyword
    case 'invalid_http_code': // For HTTP/Keyword
    case 'failed': // General failure
      return 'failed';
    case 'not found': // DNS
      return 'not_validated';
    case 'pending':
    case 'processing':
    case 'queued':
    case 'active':
      return 'pending';
    default:
      return 'n_a';
  }
};


const StatusBadge: React.FC<{ status: DomainActivityStatus; score?: number }> = ({ status, score }) => {
  let IconCmp;
  let variant: 'default' | 'secondary' | 'destructive' | 'outline' = 'outline';
  let displayText: string = status;

  switch (status) {
    case 'validated': IconCmp = CheckCircle; variant = 'default'; displayText = 'Validated'; break;
    case 'generating': IconCmp = Dna; variant = 'secondary'; displayText = 'Generating'; break;
    case 'scanned': IconCmp = Search; variant = 'default'; displayText = 'Scanned'; break;
    case 'not_validated': IconCmp = XCircle; variant = 'destructive'; displayText = 'Not Validated'; break;
    case 'failed': IconCmp = AlertCircle; variant = 'destructive'; displayText = 'Failed'; break;
    case 'no_leads': IconCmp = ShieldQuestion; variant = 'secondary'; displayText = 'No Leads'; break;
    case 'pending': IconCmp = Clock; variant = 'secondary'; displayText = 'Pending'; break;
    case 'n_a': IconCmp = HelpCircle; variant = 'outline'; displayText = 'N/A'; break;
    default: IconCmp = HelpCircle; displayText = 'Unknown';
  }

  return (
    <Badge variant={variant} className="text-xs whitespace-nowrap">
      <IconCmp className="mr-1 h-3.5 w-3.5" />
      {displayText}
      {score !== undefined && status === 'scanned' && (
        <span className="ml-1.5 flex items-center">
            <Percent className="h-3 w-3 mr-0.5"/> {score}%
        </span>
      )}
    </Badge>
  );
};


export default function CampaignDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const campaignId = params.id as string;
  const campaignTypeFromQuery = searchParams.get('type') as Campaign['campaignType'] | null;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [generatedDomains, setGeneratedDomains] = useState<GeneratedDomain[]>([]);
  const [dnsCampaignItems, setDnsCampaignItems] = useState<CampaignValidationItem[]>([]);
  const [httpCampaignItems, setHttpCampaignItems] = useState<CampaignValidationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const pageSizes = [25, 50, 100, 250];

  const streamCleanupRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef(true);

  // Helper functions - moved to top for proper hoisting
  const getGlobalLeadStatusAndScore = (domainName: string, campaign: Campaign): { status: DomainActivityStatus; score?: number } => {
        if (!campaign) {
            return { status: 'n_a' };
        }


        return { status: 'n_a' };
  };

  const getGlobalDomainStatusForPhase = (domainName: string, phase: 'dns_validation' | 'http_keyword_validation', campaign: Campaign): DomainActivityStatus => {
        if (!campaign) {
            return 'n_a';
        }

        if (phase === 'dns_validation' && dnsCampaignItems.find(item => item.domainName === domainName)?.validationStatus === 'valid') {
            return 'validated';
        }
        if (phase === 'http_keyword_validation' && httpCampaignItems.find(item => item.domainName === domainName)?.validationStatus === 'valid') {
            return 'validated';
        }
        return 'not_validated';
    };

  // Helper to convert response headers from Record<string, unknown> to Record<string, string[]>
  const convertResponseHeaders = (headers?: Record<string, unknown>): Record<string, string[]> | undefined => {
    if (!headers) return undefined;
    const converted: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (Array.isArray(value)) {
        converted[key] = value.map(v => String(v));
      } else if (typeof value === 'string') {
        converted[key] = [value];
      } else if (value != null) {
        converted[key] = [String(value)];
      }
    }
    return converted;
  };



  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (streamCleanupRef.current) {
        console.log(`[${campaignId}] Dashboard unmounting, cleaning up stream.`);
        streamCleanupRef.current();
      }
    };
  }, [campaignId]);


  const loadCampaignData = useCallback(async (showLoadingSpinner = true) => {
    if (!campaignId || !campaignTypeFromQuery) { // campaignTypeFromQuery check added
      toast({ title: "Error", description: "Campaign ID or Type missing from URL.", variant: "destructive" });
      if(isMountedRef.current) setLoading(false);
      return;
    }
    if(showLoadingSpinner && isMountedRef.current) setLoading(true);
    try {
        // Generic getCampaignById is fine as backend V2 returns type-specific params
        const campaignDetailsResponse = await getCampaignById(campaignId);

        if (campaignDetailsResponse.status === 'success' && campaignDetailsResponse.data) {
            if(isMountedRef.current) {
              setCampaign(campaignDetailsResponse.data);
              // Domain generation stream will update streamedDomains, which is then merged here.
              // For other campaign types, their items are fetched separately.
              if (campaignDetailsResponse.data.campaignType === 'domain_generation') {
                // Initial load of domains if not streaming
                if(campaignDetailsResponse.data.status === 'completed') {
                    const genDomainsResp = await getGeneratedDomainsForCampaign(campaignId, { limit: 1000, cursor: 0 }); // Fetch a large batch
                    if (genDomainsResp.status === 'success' && genDomainsResp.data) {
                       if(isMountedRef.current) setGeneratedDomains(genDomainsResp.data);
                    }
                }
              }
            }
        } else {
            toast({ title: "Error Loading Campaign", description: campaignDetailsResponse.message || "Failed to load campaign data.", variant: "destructive"});
            if(isMountedRef.current) setCampaign(null);
        }
    } catch (error: unknown) {
        console.error("Failed to load campaign data:", error);
        const errorMessage = error instanceof Error ? error.message : "An unexpected network error occurred.";
        toast({ title: "Error", description: errorMessage, variant: "destructive"});
        if(isMountedRef.current) setCampaign(null);
    } finally {
        if(showLoadingSpinner && isMountedRef.current) setLoading(false);
    }
  }, [campaignId, campaignTypeFromQuery, toast]);

  useEffect(() => {
    loadCampaignData();
  }, [loadCampaignData]);

  // Polling for non-streaming updates (e.g., overall campaign status, progress for non-DG phases)
  useEffect(() => {
    if (!campaign || campaign.status === 'completed' || campaign.status === 'failed' || campaign.status === 'paused' || campaign.status === 'pending' || (campaign.campaignType === 'domain_generation' && campaign.status === 'running')) {
      return;
    }
    const intervalId = setInterval(() => loadCampaignData(false) , 3000);
    return () => clearInterval(intervalId);
  }, [campaign, loadCampaignData]);

  // Fetch campaign items (DNS or HTTP) based on actual campaign type
  useEffect(() => {
    if (!campaign || !campaign.campaignType) return; // Use campaign.campaignType now

    const fetchItems = async () => {
      if (!isMountedRef.current) return;
      try {
        if (campaign.campaignType === 'dns_validation') {
          const dnsItemsResponse = await getDnsCampaignDomains(campaign.id, { limit: pageSize, cursor: String((currentPage - 1) * pageSize) });
          if (dnsItemsResponse.status === 'success' && dnsItemsResponse.data) {
           if(isMountedRef.current) setDnsCampaignItems(dnsItemsResponse.data);
          } else {
            toast({ title: "Error Loading DNS Items", description: dnsItemsResponse.message, variant: "destructive" });
          }
        } else if (campaign.campaignType === 'http_keyword_validation') {
          const httpItemsResponse = await getHttpCampaignItems(campaign.id, { limit: pageSize, cursor: String((currentPage - 1) * pageSize) });
          if (httpItemsResponse.status === 'success' && httpItemsResponse.data) {
            if(isMountedRef.current) setHttpCampaignItems(httpItemsResponse.data);
          } else {
            toast({ title: "Error Loading HTTP Items", description: httpItemsResponse.message, variant: "destructive" });
          }
        } else if (campaign.campaignType === 'domain_generation' && campaign.status !== 'running') {
            // Fetch initial/all generated domains if not streaming
            const genDomainsResp = await getGeneratedDomainsForCampaign(campaign.id, { limit: pageSize, cursor: (currentPage -1) * pageSize });
            if(genDomainsResp.status === 'success' && genDomainsResp.data) {
                if(isMountedRef.current) setGeneratedDomains(genDomainsResp.data);
            } else {
                 toast({ title: "Error Loading Generated Domains", description: genDomainsResp.message, variant: "destructive" });
            }
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Failed to load campaign items";
        toast({ title: "Error Loading Campaign Items", description: errorMessage, variant: "destructive" });
      }
    };
    
    // Fetch items if the campaign phase relevant to item display is active or completed
    // Use campaignType to determine which campaign type we have, status for execution state
    const selectedType = campaign.campaignType;
    const executionStatus = campaign.status; // pending, running, completed, failed, etc.
    
    // For determining which phases/items to show, we use the campaign type and status
    // Not comparing status with campaign type values - that's the bug we're fixing
    const isDNSCampaign = selectedType === 'dns_validation';
    const isHTTPCampaign = selectedType === 'http_keyword_validation';
    const isDomainGenCampaign = selectedType === 'domain_generation';
    
    // Show items if the campaign type matches and it's not just pending
    const shouldShowItems = (isDNSCampaign || isHTTPCampaign || isDomainGenCampaign) && executionStatus !== 'pending';
    const isDomainGenPhaseNotStreaming = isDomainGenCampaign && executionStatus !== 'running';


    if (shouldShowItems) {
      fetchItems();
      // Simple poll for items if campaign is still running
      if (executionStatus === 'running') {
          const itemPollInterval = setInterval(fetchItems, 5000);
          return () => clearInterval(itemPollInterval);
      }
    }
    
    // Return undefined for other code paths
    return undefined;
  }, [campaign, campaignTypeFromQuery, toast, pageSize, currentPage]);


  // Effect for handling domain generation streaming via WebSocket
  useEffect(() => {
    if (!campaign || campaign.campaignType !== 'domain_generation' || campaign.status !== 'running' || !isMountedRef.current) {
      if(streamCleanupRef.current) {
        console.log(`[${campaignId}] Stopping stream because conditions not met (status: ${campaign?.status})`);
        streamCleanupRef.current();
        streamCleanupRef.current = null;
      }
      return;
    }
    
    if (streamCleanupRef.current) {
        console.log(`[${campaignId}] Stream already active or cleanup pending. Not starting new one.`);
        return;
    }

    console.log(`[${campaignId}] Conditions met for Domain Generation stream. Initiating.`);
    const handleDomainReceived = (domain: string) => {
        if (!isMountedRef.current) return;
         // Update the main 'generatedDomains' state used by the table directly
        setGeneratedDomains(prev => {
            const newSet = new Set([...prev.map(d => d.domainName), domain]);
            // Create new GeneratedDomain objects for the table
            return Array.from(newSet).map(dName => {
                const existingDomain = prev.find(gd => gd.domainName === dName);
                return {
                    id: existingDomain?.id || dName, // Use existing ID or domain name as fallback
                    generationCampaignId: campaignId,
                    domainName: dName,
                    offsetIndex: existingDomain?.offsetIndex || 0,
                    generatedAt: existingDomain?.generatedAt || new Date().toISOString(),
                    createdAt: existingDomain?.createdAt || new Date().toISOString(),
                } as GeneratedDomain;
            });
        });
    };

    const handleStreamComplete = (phaseCompleted: CampaignStatus, error?: Error) => {
        if (!isMountedRef.current) {
          console.log(`[${campaignId}] Stream onComplete (WS) called but component unmounted.`);
          return;
        }
        console.log(`[${campaignId}] Domain Generation stream (WS) for phase ${phaseCompleted} ended. Error: ${error ? error.message : 'none'}`);
        
        setActionLoading(prev => {
            const newLoading = { ...prev };
            delete newLoading[`phase-${phaseCompleted}`]; // Use phaseCompleted from callback
            return newLoading;
        });
        loadCampaignData(!error); 
        streamCleanupRef.current = null; 
    };
    
    // Connect to domain generation stream using production WebSocket service
    const cleanup = websocketService.connectToCampaign(
      campaignId,
      (message) => {
        if (message.type === 'domain_generated' && message.data && typeof message.data === 'object') {
          const data = message.data as { domain?: string };
          if (data.domain) {
            handleDomainReceived(data.domain);
          }
        } else if (message.type === 'campaign_complete') {
          handleStreamComplete('completed');
        }
      },
      (error) => {
        console.error(`[${campaignId}] Error setting up domain stream (WS):`, error);
        if (isMountedRef.current) {
          handleStreamComplete('failed', error instanceof Error ? error : new Error(String(error)));
        }
      }
    );

    if (isMountedRef.current) {
      streamCleanupRef.current = cleanup;
    } else {
      cleanup();
    }

    return () => {
      if (streamCleanupRef.current) {
        console.log(`[${campaignId}] Cleaning up WebSocket stream from useEffect (status: ${campaign?.status}).`);
        streamCleanupRef.current();
        streamCleanupRef.current = null;
      }
    };
  }, [campaign, campaignId, loadCampaignData]);


  const submitStartPhase = async (payload: StartCampaignPhasePayload) => {
    if (!campaign || !campaign.campaignType || actionLoading[`phase-${payload.phaseToStart}`]) return;
    setActionLoading(prev => ({...prev, [`phase-${payload.phaseToStart}`]: true }));
    try {
      // The campaignService.startCampaignPhase now uses the V2 /start endpoint
      const response = await startCampaignPhase(campaign.id);
      if (response.status === 'success' && response.data) {
        if(isMountedRef.current) {
            setCampaign(prev => prev ? { ...prev, ...response.data } : null);
        }
        toast({
          title: `${phaseDisplayNames[payload.phaseToStart] || payload.phaseToStart} Started`,
          description: response.message || `Phase for campaign "${campaign.name}" is now in progress.`,
        });
      } else {
        toast({ title: "Error Starting Phase", description: response.message, variant: "destructive"});
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to start phase";
      toast({ title: "Error Starting Phase", description: errorMessage, variant: "destructive"});
    } finally {
      // For DomainGeneration, loading state is managed by stream start/end.
      // For other phases, reset it here.
      if (payload.phaseToStart !== 'domain_generation' && isMountedRef.current) {
        setActionLoading(prev => ({...prev, [`phase-${payload.phaseToStart}`]: false }));
      }
    }
  };

  const handlePhaseActionTrigger = (phaseToStart: CampaignType) => {
    if (!campaign || !campaign.campaignType || actionLoading[`phase-${phaseToStart}`]) return;

    // V2 API uses simple campaignId, not complex payload
    const actionKey = `phase-${phaseToStart}`;
    setActionLoading(prev => ({ ...prev, [actionKey]: true }));

    const payload: StartCampaignPhasePayload = {
      campaignId: campaign.id,
      phaseToStart,
      // Note: V2 API /start endpoint just needs campaignId
      // Domain source and other configs are stored in campaign already
      domainSource: campaign.dnsValidationParams?.sourceGenerationCampaignId ? "campaign_output" : undefined,
      numberOfDomainsToProcess: campaign.totalItems
    };
    
    // Use the simplified V2 API call
    submitStartPhase(payload);
  };

  
  const handleCampaignControl = async (action: 'pause' | 'resume' | 'stop') => {
    if (!campaign || !campaign.campaignType || actionLoading[`control-${action}`]) return;
    setActionLoading(prev => ({...prev, [`control-${action}`]: true }));
    try {
        let response: { status: string; data?: Partial<Campaign>; message?: string };
        
        if (action === 'pause') {
            response = await pauseCampaign(campaign.id);
        } else if (action === 'resume') {
            response = await resumeCampaign(campaign.id);
        } else if (action === 'stop') {
            response = await stopCampaign(campaign.id); // Mapped to /cancel
        } else {
            throw new Error(`Unknown action: ${action}`);
        }

        if (response.status === 'success' && response.data) {
            if(isMountedRef.current) setCampaign(prev => prev ? { ...prev, ...response.data } : null);
            toast({ title: `Campaign ${action}ed`, description: response.message });
        } else {
            toast({ title: `Error ${action}ing campaign`, description: response.message, variant: "destructive"});
        }
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : `Failed to ${action} campaign`;
        toast({ title: `Error ${action}ing campaign`, description: errorMessage, variant: "destructive"});
    } finally {
        if(isMountedRef.current) setActionLoading(prev => ({...prev, [`control-${action}`]: false }));
    }
  };


  const handleDownloadDomains = (domainsToDownload: string[] | undefined, fileNamePrefix: string) => {
    if (!domainsToDownload || domainsToDownload.length === 0) {
      toast({ title: "No Domains", description: "There are no domains in this list to export.", variant: "destructive"});
      return;
    }
    const textContent = domainsToDownload.join('\n');
    const blob = new Blob([textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileNamePrefix}_${campaign?.name.replace(/\s+/g, '_') || 'campaign'}_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Export Started", description: `${domainsToDownload.length} domains are being downloaded.`});
  };

  const campaignDomainDetails = useMemo((): CampaignDomainDetail[] => {
    if (!campaign || !campaign.campaignType) return []; // Use campaign.campaignType
    
    let itemsToMap: Array<GeneratedDomain | CampaignValidationItem | { domainName: string; id: string }> = [];
    let itemType: 'dns' | 'http' | 'domain_gen' | 'lead_gen_base' = 'domain_gen'; // Default assumption

    if (campaign.campaignType === 'domain_generation') {
        itemsToMap = generatedDomains; // Use fetched/streamed generated domains
        itemType = 'domain_gen';
    } else if (campaign.campaignType === 'dns_validation') {
        itemsToMap = dnsCampaignItems;
        itemType = 'dns';
    } else if (campaign.campaignType === 'http_keyword_validation') {
        itemsToMap = httpCampaignItems;
        itemType = 'http';
    } else if (campaign.campaignType === 'http_keyword_validation') {
        // For Lead Gen, the "base" list of domains might come from its HTTP validated input
        // or its own generation if that was the source.
        // This needs more specific handling based on how Lead Gen sources its domains.
        // For now, assume it operates on httpValidatedDomains if available, or campaign.domains if internal gen.
        itemsToMap = httpCampaignItems.map(d => ({domainName: d.domainName, id: d.id})) || [];
        itemType = 'lead_gen_base'; // Indicates we're showing base domains, lead status applied
    }

    if (itemType === 'dns' || itemType === 'http') {
        return itemsToMap.map((item: GeneratedDomain | CampaignValidationItem | { domainName: string; id: string }): CampaignDomainDetail => {
            const domainName = ('domainName' in item && typeof item.domainName === 'string' && item.domainName) || 
                              ('domainOrUrl' in item && typeof item.domainOrUrl === 'string' && item.domainOrUrl) || 
                              ('id' in item && typeof item.id === 'string' && item.id) || 
                              'unknown-domain';
            const leadInfo = getGlobalLeadStatusAndScore(domainName, campaign);
            
            // Type guards for proper property access
            const isDnsItem = itemType === 'dns' && 'validationStatus' in item;
            const isHttpItem = itemType === 'http' && 'validationStatus' in item;
            
            return {
                id: ('id' in item && typeof item.id === 'string' && item.id) || domainName,
                domainName,
                generatedDate: campaign.createdAt,
                dnsStatus: isDnsItem ? getDomainStatusFromItem((item as CampaignValidationItem).validationStatus) : getGlobalDomainStatusForPhase(domainName, 'dns_validation', campaign),
                dnsError: isDnsItem ? (item as CampaignValidationItem).errorDetails : undefined,
                dnsResultsByPersona: isDnsItem ? {'backend-persona': {
                    id: `dns-${domainName}`,
                    dnsCampaignId: campaignId,
                    domainName: domainName,
                    validationStatus: (item as CampaignValidationItem).validationStatus,
                    createdAt: (item as CampaignValidationItem).lastCheckedAt || new Date().toISOString(),
                    attempts: (item as CampaignValidationItem).attempts ?? null,
                }} : undefined,

                httpStatus: isHttpItem ? getDomainStatusFromItem((item as CampaignValidationItem).validationStatus) : getGlobalDomainStatusForPhase(domainName, 'http_keyword_validation', campaign),
                httpError: isHttpItem ? (item as CampaignValidationItem).errorDetails : undefined,
                httpStatusCode: isHttpItem ? (item as CampaignValidationItem).httpStatusCode : undefined,
                httpFinalUrl: isHttpItem ? (item as CampaignValidationItem).finalUrl : undefined,
                httpContentHash: isHttpItem ? (item as CampaignValidationItem).contentHash : undefined,
                httpTitle: isHttpItem ? (item as CampaignValidationItem).extractedTitle : undefined,
                httpResponseHeaders: isHttpItem ? convertResponseHeaders((item as CampaignValidationItem).responseHeaders) : undefined,
                
                leadScanStatus: leadInfo.status,
                leadDetails: undefined,
            };
        }).sort((a,b) => a.domainName.localeCompare(b.domainName));
    } else { // For Domain Generation or Lead Gen base domains
        return itemsToMap.map((item: GeneratedDomain | CampaignValidationItem | { domainName: string; id: string }): CampaignDomainDetail => {
            const domainName = ('domainName' in item && item.domainName) || '';
            const leadInfo = getGlobalLeadStatusAndScore(domainName, campaign);
            return {
                id: ('id' in item && item.id) || domainName,
                domainName,
                generatedDate: ('generatedAt' in item && item.generatedAt) || campaign.createdAt,
                dnsStatus: getGlobalDomainStatusForPhase(domainName, 'dns_validation', campaign),
                httpStatus: getGlobalDomainStatusForPhase(domainName, 'http_keyword_validation', campaign),
                leadScanStatus: leadInfo.status,
                leadDetails: undefined,
            };
        }).sort((a,b) => a.domainName.localeCompare(b.domainName));
    }
  }, [campaign, campaignId, generatedDomains, dnsCampaignItems, httpCampaignItems]);

  // Pagination logic for campaignDomainDetails
  const totalDomains = campaignDomainDetails.length;
  const totalPages = Math.ceil(totalDomains / pageSize);
  const paginatedDomains = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return campaignDomainDetails.slice(startIndex, startIndex + pageSize);
  }, [campaignDomainDetails, currentPage, pageSize]);

  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setCurrentPage(1);
  };

  const goToNextPage = () => setCurrentPage(prev => Math.min(prev + 1, totalPages));
  const goToPreviousPage = () => setCurrentPage(prev => Math.max(prev - 1, 1));


  if (loading && !campaign) {
    return (
      <div className="space-y-6">
        <PageHeader title="Loading Campaign..." icon={Briefcase} />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!campaign || !campaign.campaignType) { // Use campaign.campaignType
    return (
      <div className="text-center py-10">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
        <PageHeader title="Campaign Not Found" description="The requested campaign could not be loaded, does not exist, or type is missing from URL." icon={Briefcase} />
        <Button onClick={() => router.push('/campaigns')} className="mt-6">Back to Campaigns</Button>
      </div>
    );
  }

  const phasesForSelectedType = CAMPAIGN_PHASES_ORDERED[campaign.campaignType] || [];
  const currentPhaseIndexInType = (campaign.status === "pending" || campaign.status === "completed" || campaign.status === "failed" || campaign.status === "paused")
    ? -1
    : campaign.status ? phasesForSelectedType.indexOf(campaign.status) : -1;

  const renderPhaseButtons = () => {
    if ((campaign as Campaign)?.status === "completed") return <p className="text-lg font-semibold text-green-500 flex items-center gap-2"><CheckCircle className="h-6 w-6"/>Campaign Completed!</p>;
    
    if ((campaign as Campaign)?.status === "failed") {
       const failedPhaseName = campaign.campaignType ? (phaseDisplayNames[campaign.campaignType] || campaign.campaignType) : 'Unknown Phase';
       // Retry for failed phase should use the StartCampaignPhase logic
       return (
         <div className="text-center">
           <p className="text-lg font-semibold text-destructive mb-2">Failed: {failedPhaseName}</p>
           {campaign.errorMessage && <p className="text-sm text-muted-foreground mb-3">Error: {campaign.errorMessage}</p>}
           {campaign.status && (
             <PhaseGateButton
               label={`Retry ${failedPhaseName}`}
               onClick={() => handlePhaseActionTrigger(campaign.campaignType!)}
               Icon={RefreshCw}
               variant="destructive"
               isLoading={actionLoading[`phase-${campaign.campaignType}`]}
               disabled={!!actionLoading[`phase-${campaign.campaignType}`]}
             />
           )}
         </div>
       );
    }
    if (campaign.status === "paused") {
        const pausedPhaseName = campaign.campaignType ? (phaseDisplayNames[campaign.campaignType] || campaign.campaignType) : 'Unknown Phase';
        return <PhaseGateButton label={`Resume ${pausedPhaseName}`} onClick={() => handleCampaignControl('resume')} Icon={PlayCircle} isLoading={actionLoading['control-resume']} disabled={!!actionLoading['control-resume']} />;
    }
    if (campaign.status === "pending") {
        // Start the very first phase of this campaign type from the V2 spec
        const selectedType = campaign.campaignType;
        if (selectedType) {
          const firstPhase = getFirstPhase(selectedType);
          if (firstPhase) {
            const phaseDisplayName = phaseDisplayNames[firstPhase as CampaignType] || firstPhase;
            const phaseIcon = phaseIcons[firstPhase as CampaignType] || Play;
            return <PhaseGateButton label={`Start ${phaseDisplayName}`} onClick={() => handlePhaseActionTrigger(firstPhase as CampaignType)} Icon={phaseIcon} isLoading={actionLoading[`phase-${firstPhase}`]} disabled={!!actionLoading[`phase-${firstPhase}`]} />;
          }
        }
    }
    if (campaign.status === "running") {
        let progressText = `(${campaign.progressPercentage}%)`;
        if(campaign.campaignType === 'domain_generation') {
             const generatedCount = generatedDomains.length; // Use length of fetched/streamed domains
             const campaignTarget = campaign.domainGenerationParams?.numDomainsToGenerate || 'all possible';
             progressText = `(${generatedCount} / ${campaignTarget} - ${campaign.progressPercentage}%)`;
        }
        const currentPhaseName = campaign.campaignType ? (phaseDisplayNames[campaign.campaignType] || campaign.campaignType) : 'Unknown Phase';
        return <p className="text-sm text-muted-foreground text-center">Current phase: {currentPhaseName} is in progress {progressText}... <RefreshCw className="inline-block ml-2 h-4 w-4 animate-spin" /></p>;
    }
    
    // This logic might be simplified if backend drives all phase transitions after /start
    if ((campaign as Campaign)?.status === "completed") {
        const selectedType = campaign.campaignType;
        if (selectedType) {
          // For now, just show completion - proper phase tracking should come from backend
          return <p className="text-lg font-semibold text-green-500 flex items-center gap-2"><CheckCircle className="h-6 w-6"/>Campaign Completed!</p>;
        }
    }
    
    // For failed campaigns
    if ((campaign as Campaign)?.status === "failed") {
        return <p className="text-lg font-semibold text-red-500 flex items-center gap-2"><XCircle className="h-6 w-6"/>Campaign Failed</p>;
    }
    
    return null;
  };

  const renderCampaignControlButtons = () => {
    if (!campaign || campaign.status === 'completed' || campaign.status === 'pending' || campaign.status === 'failed') return null;
    return (
      <div className="flex gap-2 justify-center">
        {campaign.status === 'running' && (
          <Button variant="outline" size="sm" onClick={() => handleCampaignControl('pause')} disabled={actionLoading['control-pause']} isLoading={actionLoading['control-pause']}>
            <PauseCircle className="mr-2 h-4 w-4" /> Pause <span className="text-xs ml-1 text-muted-foreground">(API: /pause)</span>
          </Button>
        )}
        {campaign.status === 'paused' && (
          <Button variant="outline" size="sm" onClick={() => handleCampaignControl('resume')} disabled={actionLoading['control-resume']} isLoading={actionLoading['control-resume']}>
            <PlayCircle className="mr-2 h-4 w-4" /> Resume <span className="text-xs ml-1 text-muted-foreground">(API: /resume)</span>
          </Button>
        )}
        {(campaign.status === 'running' || campaign.status === 'paused') && (
          <Button variant="destructive" size="sm" onClick={() => handleCampaignControl('stop')} disabled={actionLoading['control-stop']} isLoading={actionLoading['control-stop']}>
            <StopCircle className="mr-2 h-4 w-4" /> Cancel <span className="text-xs ml-1 text-muted-foreground">(API: /cancel)</span>
          </Button>
        )}
      </div>
    );
  };


  const getSimilarityBadgeVariant = (score: number) => {
    if (score >= 85) return "default";
    else if (score >= 70) return "secondary";
    else return "outline";
  };

  const renderConsolidatedResultsTable = () => {
    if (campaignDomainDetails.length === 0 && campaign.campaignType !== 'domain_generation' && !(campaign.status === 'running' && (campaign.campaignType === 'dns_validation' || campaign.campaignType === 'http_keyword_validation'))) {
        return <p className="text-center text-muted-foreground py-6">No domains processed or generated yet for this campaign.</p>;
    }
    if (campaignDomainDetails.length === 0 && (campaign.status === 'running' && (campaign.campaignType === 'domain_generation' || campaign.campaignType === 'dns_validation' || campaign.campaignType === 'http_keyword_validation'))) {
        return <p className="text-center text-muted-foreground py-6 flex items-center justify-center"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Waiting for domain results...</p>;
    }

    const startItem = (currentPage - 1) * pageSize + 1;
    const endItem = Math.min(currentPage * pageSize, totalDomains);

    return (
        <Card className="mt-6 shadow-lg">
            <CardHeader>
                <CardTitle>Campaign Domain Details ({totalDomains})</CardTitle>
                <CardDescription>Real-time status of domains processed in this campaign.</CardDescription>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[400px] border rounded-md">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[35%]">Domain</TableHead>
                                <TableHead className="text-center">DNS Status</TableHead>
                                <TableHead className="text-center">HTTP Status</TableHead>
                                <TableHead className="text-center">Lead Status</TableHead>
                                <TableHead className="text-center">Lead Score</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedDomains.map((detail) => (
                                <TableRow key={detail.id}>
                                    <TableCell className="font-medium truncate" title={detail.domainName}>
                                      <a href={`http://${detail.domainName}`} target="_blank" rel="noopener noreferrer" className="hover:underline text-primary">
                                        {detail.domainName} <ExternalLink className="inline-block ml-1 h-3 w-3 opacity-70"/>
                                      </a>
                                    </TableCell>
                                    <TableCell className="text-center"><StatusBadge status={detail.dnsStatus} /></TableCell>
                                    <TableCell className="text-center"><StatusBadge status={detail.httpStatus} /></TableCell>
                                    <TableCell className="text-center"><StatusBadge status={detail.leadScanStatus} /></TableCell>
                                    <TableCell className="text-center">
                                      {detail.leadDetails?.similarityScore !== undefined ? (
                                          <Badge variant={getSimilarityBadgeVariant(detail.leadDetails.similarityScore)} className="text-xs">
                                              <Percent className="mr-1 h-3 w-3"/> {detail.leadDetails.similarityScore}%
                                          </Badge>
                                      ) : (detail.leadScanStatus !== 'pending' && detail.leadScanStatus !== 'n_a') ? <span className="text-xs text-muted-foreground">-</span> : null}
                                    </TableCell>
                                </TableRow>
                            ))}
                             {paginatedDomains.length === 0 && totalDomains > 0 && (
                                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No domains on this page.</TableCell></TableRow>
                            )}
                            {paginatedDomains.length === 0 && totalDomains === 0 && (
                                 <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No domains to display yet.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </ScrollArea>
                 <div className="mt-4 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>Rows per page:</span>
                        <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
                            <SelectTrigger className="w-[70px] h-8 text-xs">
                                <SelectValue placeholder={pageSize} />
                            </SelectTrigger>
                            <SelectContent>
                                {pageSizes.map(size => (
                                    <SelectItem key={size} value={String(size)} className="text-xs">{size}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <span>Showing {totalDomains > 0 ? startItem : 0}-{endItem} of {totalDomains}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={goToPreviousPage}
                            disabled={currentPage === 1}
                            className="h-8"
                        >
                            <ChevronLeft className="h-4 w-4 mr-1 sm:mr-2" /> <span className="hidden sm:inline">Previous</span>
                        </Button>
                        <span className="text-sm text-muted-foreground">Page {currentPage} of {totalPages > 0 ? totalPages : 1}</span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={goToNextPage}
                            disabled={currentPage === totalPages || totalPages === 0}
                            className="h-8"
                        >
                           <span className="hidden sm:inline">Next</span> <ChevronRight className="h-4 w-4 ml-1 sm:ml-2" />
                        </Button>
                    </div>
                </div>
                 <div className="mt-6 flex flex-wrap justify-end space-x-0 sm:space-x-2 space-y-2 sm:space-y-0">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            // For V2, initial/generated domains for DG campaign are fetched via results endpoint
                            // For other types, depends on how source domains are stored/accessed.
                            // This needs to be type-aware.
                            let domainsToDownload: string[] | undefined = undefined;
                            if (campaign.campaignType === 'domain_generation') {
                                domainsToDownload = generatedDomains.map(d => d.domainName);
                            } else if (campaign.dnsValidationParams?.sourceGenerationCampaignId) {
                                // Need to fetch the domains from the source campaign
                            }
                            handleDownloadDomains(domainsToDownload, 'initial_or_generated_domains');
                        }}
                        disabled={
                            (campaign.campaignType === 'domain_generation' && generatedDomains.length === 0)
                        }
                    >
                        <Download className="mr-2 h-4 w-4" /> Export Initial/Generated ({
                           campaign.campaignType === 'domain_generation' ? generatedDomains.length : 0
                        })
                         <span className="text-xs ml-1 text-muted-foreground">(API: /results/generated-domains)</span>
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadDomains(dnsCampaignItems.map(d => d.domainName), 'dns_validated_domains')}
                        disabled={dnsCampaignItems.length === 0}
                    >
                        <Download className="mr-2 h-4 w-4" /> Export DNS Valid ({dnsCampaignItems.length})
                        <span className="text-xs ml-1 text-muted-foreground">(API: /results/dns-validation)</span>
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadDomains(httpCampaignItems.map(item => item.domainName).filter(Boolean), 'http_validated_domains')}
                        disabled={httpCampaignItems.length === 0}
                    >
                        <Download className="mr-2 h-4 w-4" /> Export HTTP Valid ({httpCampaignItems.length})
                        <span className="text-xs ml-1 text-muted-foreground">(API: /results/http-keyword)</span>
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
  };


  return (
    <div className="space-y-6">
      <PageHeader
        title={campaign.name}
        description={`Dashboard for ${campaign.campaignType} campaign.`}
        icon={Briefcase}
        actionButtons={<Button variant="outline" onClick={() => loadCampaignData(true)} disabled={loading || Object.values(actionLoading).some(v=>v)}><RefreshCw className={cn("mr-2 h-4 w-4", (loading || Object.values(actionLoading).some(v=>v)) && "animate-spin")}/> Refresh</Button>}
      />

      <Card className="shadow-lg">
        <CardHeader><CardTitle>Campaign Progress</CardTitle><CardDescription>Current status for &quot;{campaign.selectedType}&quot;.</CardDescription></CardHeader>
        <CardContent><CampaignProgress campaign={campaign} /></CardContent>
      </Card>

      <Card className="shadow-lg">
        <CardHeader><CardTitle>Campaign Actions</CardTitle></CardHeader>
        <CardContent className="flex flex-col items-center justify-center min-h-[80px] space-y-3">
            {renderPhaseButtons()}
            {renderCampaignControlButtons()}
             {/* V2 API endpoint for starting is POST /api/v2/v2/campaigns/{campaignId}/start */}
            <p className="text-xs text-muted-foreground pt-2">
                Phase Trigger API: POST /api/v2/v2/campaigns/{campaign.id}/start
            </p>
        </CardContent>
      </Card>
      
      {renderConsolidatedResultsTable()}

      {(phasesForSelectedType.includes("LeadGeneration") &&
        (currentPhaseIndexInType >= phasesForSelectedType.indexOf("http_keyword_validation") || campaign.status === "completed")
        ) && (
        <ContentSimilarityView campaign={campaign} />
      )}
      
    </div>
  );
}