
"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { Campaign, LatestDomainActivity, CampaignPhase, DomainActivityStatus, CampaignsListResponse, CampaignSelectedType } from '@/lib/types';
import { CAMPAIGN_PHASES_ORDERED } from '@/lib/constants';
import { ScrollArea } from '../ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle, XCircle, Clock, HelpCircle, Search, ShieldQuestion, ExternalLink, Activity, Dna, AlertCircle, ChevronLeft, ChevronRight, Percent } from 'lucide-react';
import Link from 'next/link';
import { getCampaigns } from '@/lib/services/campaignService.production'; // Updated import path

const MAX_ITEMS_DISPLAY_INITIAL_LOAD = 200; // Max items to process for the global table initially
const DEFAULT_PAGE_SIZE_GLOBAL = 50;
const GLOBAL_PAGE_SIZES = [25, 50, 100, 200];


const formatDate = (dateString: string): string => {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    // Using a common, unambiguous format. Adjust locale string as needed.
    // Example: 'en-CA' gives YYYY-MM-DD. 'en-US' gives MM/DD/YYYY.
    return date.toLocaleDateString('en-CA'); // Or 'en-US', 'default'
  } catch {
    return 'Invalid Date';
  }
};

// Helper function to determine domain status for the consolidated table
const getGlobalDomainStatusForPhase = (
  domainName: string,
  phase: CampaignPhase,
  campaign: Campaign
): DomainActivityStatus => {
  const selectedType = campaign.selectedType || campaign.campaignType;
  const phasesForType = CAMPAIGN_PHASES_ORDERED[selectedType];
  if (!phasesForType.includes(phase)) return 'N/A'; // Phase not applicable to this campaign type

  const phaseIndexInType = phasesForType.indexOf(phase);
  const currentCampaignPhaseIndexInType = campaign.currentPhase ? phasesForType.indexOf(campaign.currentPhase) : -1;

  // Determine if the domain was successfully processed in this phase
  let validatedInThisPhase = false;
  if (phase === 'DNSValidation') validatedInThisPhase = !!campaign.dnsValidatedDomains?.includes(domainName);
  else if (phase === 'HTTPValidation') validatedInThisPhase = !!campaign.httpValidatedDomains?.includes(domainName);
  // LeadGeneration status is handled separately by getGlobalLeadStatus

  if (validatedInThisPhase) return 'Validated';
  
  // If campaign is fully completed, and this phase was part of its flow
  if (campaign.currentPhase === 'Completed' && phasesForType.includes(phase)) {
     // If it reached here, it means it wasn't in the validated list for this phase
     return 'Not Validated';
  }

  // If current campaign phase is past the phase we're checking for this domain,
  // and it wasn't validated, then it's 'Not Validated' for that phase.
  if (currentCampaignPhaseIndexInType > phaseIndexInType || (campaign.currentPhase === phase && campaign.phaseStatus === 'Failed')) {
    // Check if this domain *should* have been processed by this phase
    if (phase === 'DNSValidation' && (campaign.domains || []).includes(domainName)) return 'Not Validated';
    if (phase === 'HTTPValidation' && (campaign.dnsValidatedDomains || []).includes(domainName)) return 'Not Validated';
    return 'N/A'; // Not applicable or filtered out before even reaching this phase's potential input
  }
  
  // If current campaign phase IS the phase we're checking and it's active
  if (campaign.currentPhase === phase && (campaign.phaseStatus === 'InProgress' || campaign.phaseStatus === 'Paused' || campaign.phaseStatus === 'Pending')) {
    return 'Pending';
  }
  
  // If current campaign phase is before the phase we're checking, or campaign is Idle
  if (currentCampaignPhaseIndexInType < phaseIndexInType || campaign.currentPhase === 'Idle') {
    // If the domain was generated (in `campaign.domains`) but not yet DNS validated, it's pending for DNS
    if (phase === 'DNSValidation' && (campaign.domains || []).includes(domainName)) return 'Pending';
     // If DNS validated but not yet HTTP validated, it's pending for HTTP
    if (phase === 'HTTPValidation' && (campaign.dnsValidatedDomains || []).includes(domainName)) return 'Pending';

    return 'Pending'; // General pending for phases not yet reached
  }

  return 'Pending'; // Default catch-all
};


const getGlobalLeadStatusAndScore = (
  domainName: string,
  campaign: Campaign
): { status: DomainActivityStatus; score?: number } => {
    const selectedType = campaign.selectedType || campaign.campaignType;
    const phasesForType = CAMPAIGN_PHASES_ORDERED[selectedType];
    if (!phasesForType.includes('LeadGeneration')) return { status: 'N/A' };

    const leadGenPhaseIndex = phasesForType.indexOf('LeadGeneration');
    const currentPhaseOrderInType = campaign.currentPhase ? phasesForType.indexOf(campaign.currentPhase) : -1;

    const relevantLeads = (campaign.leads || []).filter(lead => lead.sourceUrl?.includes(domainName) || lead.name?.includes(domainName));
    const hasLeads = relevantLeads.length > 0;
    const score = hasLeads ? relevantLeads[0]?.similarityScore : undefined;


    if (campaign.currentPhase === 'LeadGeneration' && campaign.phaseStatus === 'Succeeded') {
        return { status: hasLeads ? 'Scanned' : 'No Leads', score };
    }
    // If campaign is fully completed, and lead generation was part of its flow
    if (campaign.currentPhase === 'Completed' && phasesForType.includes('LeadGeneration')) {
        // Check if leads exist for this domain from when the LeadGen phase was active
        return { status: hasLeads ? 'Scanned' : 'No Leads', score };
    }
    if (campaign.currentPhase === 'LeadGeneration' && (campaign.phaseStatus === 'InProgress' || campaign.phaseStatus === 'Pending' || campaign.phaseStatus === 'Paused')) {
        return { status: 'Pending', score };
    }
    if (campaign.currentPhase === 'LeadGeneration' && campaign.phaseStatus === 'Failed') {
        return { status: 'Failed', score };
    }
    // If current campaign phase is before Lead Generation
    if (currentPhaseOrderInType < leadGenPhaseIndex || campaign.currentPhase === 'Idle') {
        return { status: 'Pending', score };
    }
    // If current phase is HTTPValidation Succeeded, and LeadGen is next applicable phase
    if (phasesForType[currentPhaseOrderInType] === 'HTTPValidation' && campaign.phaseStatus === 'Succeeded' && phasesForType[leadGenPhaseIndex] === 'LeadGeneration' && leadGenPhaseIndex > currentPhaseOrderInType) {
        return { status: 'Pending', score };
    }


    return { status: 'Pending', score }; // Default if phase not yet active for this domain
};

const getSimilarityBadgeVariant = (score: number | undefined) => {
  if (score === undefined) return "outline"; // For 'N/A' or '-' when score isn't applicable
  if (score > 75) return "default"; // Using ShadCN 'default' which is primary color
  if (score > 50) return "secondary";
  if (score > 25) return "outline"; // More muted for lower scores
  return "destructive"; // For very low scores or if needed
};


const StatusBadge: React.FC<{ status: DomainActivityStatus; score?: number }> = ({ status }) => {
  let Icon;
  let variant: 'default' | 'secondary' | 'destructive' | 'outline' = 'outline';
  let text = status;

  switch (status) {
    case 'Validated': Icon = CheckCircle; variant = 'default'; break;
    case 'Generating': Icon = Dna; variant = 'secondary'; text="Generating"; break; 
    case 'Scanned': Icon = Search; variant = 'default'; break;
    case 'Not Validated': Icon = XCircle; variant = 'destructive'; break;
    case 'Failed': Icon = AlertCircle; variant = 'destructive'; break;
    case 'No Leads': Icon = ShieldQuestion; variant = 'secondary'; text = "No Leads"; break;
    case 'Pending': Icon = Clock; variant = 'secondary'; break;
    case 'N/A': Icon = HelpCircle; variant = 'outline'; break;
    default: Icon = HelpCircle;
  }

  return (
    <Badge variant={variant} className="text-xs whitespace-nowrap">
      <Icon className="mr-1 h-3.5 w-3.5" />
      {text}
      {/* Score display integrated here for 'Scanned' status, or if score is always present */}
      {/* For this table, score is tied to 'leadScanStatus' if it implies scoring */}
      {/* Let's adjust: Score display is better handled by a separate column in the table */}
    </Badge>
  );
};


export default function LatestActivityTable() {
  const [allActivityData, setAllActivityData] = useState<LatestDomainActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE_GLOBAL);


  const fetchAndProcessData = useCallback(async (showLoadingSpinner = true) => {
    if (showLoadingSpinner) setLoading(true);
    try {
      const response: CampaignsListResponse = await getCampaigns();
      const processedActivities: LatestDomainActivity[] = [];

      if (response.status === 'success' && Array.isArray(response.data)) {
        const campaignsArray = response.data;
        campaignsArray.forEach(campaign => {
          (campaign.domains || []).forEach(domainName => {
            const leadInfo = getGlobalLeadStatusAndScore(domainName, campaign);
            processedActivities.push({
              id: `${campaign.id}-${domainName}`, // Unique ID for the activity row
              domainName,
              generatedDate: campaign.createdAt, // Or a more specific date if available per domain
              dnsStatus: getGlobalDomainStatusForPhase(domainName, 'DNSValidation', campaign),
              httpStatus: getGlobalDomainStatusForPhase(domainName, 'HTTPValidation', campaign),
              leadScanStatus: leadInfo.status,
              leadScore: leadInfo.score, // Store the score here
              campaignName: campaign.name,
              campaignId: campaign.id,
              sourceUrl: `http://${domainName}`, // Assuming HTTP for direct link
            });
          });
        });
      } else {
        console.error("Failed to load campaigns for activity table:", response.message);
        // setAllActivityData([]); // Keep existing data on error if not showLoadingSpinner?
      }

      // Sort by date, then slice for initial load cap
      const sortedData = processedActivities
        .sort((a, b) => new Date(b.generatedDate).getTime() - new Date(a.generatedDate).getTime())
        .slice(0, MAX_ITEMS_DISPLAY_INITIAL_LOAD); // Apply cap after sorting all potential activities

      setAllActivityData(sortedData);
    } catch (error) {
      console.error("Failed to load or process activity data:", error);
       setAllActivityData([]); // Clear on major error
    } finally {
      if (showLoadingSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAndProcessData(); // Initial fetch
    // Polling interval
    const intervalId = setInterval(() => fetchAndProcessData(false), 10000); // Poll every 10 seconds without full loading spinner
    return () => clearInterval(intervalId); // Cleanup on unmount
  }, [fetchAndProcessData]);

  // Pagination logic
  const totalActivities = allActivityData.length; // This is now the length of the capped & sorted list
  const totalPages = Math.ceil(totalActivities / pageSize);
  const paginatedActivities = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return allActivityData.slice(startIndex, startIndex + pageSize);
  }, [allActivityData, currentPage, pageSize]);

  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setCurrentPage(1); // Reset to first page when page size changes
  };

  const goToNextPage = () => setCurrentPage(prev => Math.min(prev + 1, totalPages));
  const goToPreviousPage = () => setCurrentPage(prev => Math.max(prev - 1, 1));

  if (loading) {
    return (
      <Card className="shadow-lg col-span-1 md:col-span-2 lg:col-span-3">
        <CardHeader>
          <CardTitle className="text-xl flex items-center"><Activity className="mr-2 h-6 w-6 text-primary" /> Latest Domain Activity</CardTitle>
          <CardDescription>Loading recent domain intelligence updates...</CardDescription>
        </CardHeader>
        <CardContent>
          {/* You can use a Skeleton loader here for better UX */}
          <div className="h-48 flex items-center justify-center text-muted-foreground">
            <Clock className="mr-2 h-5 w-5 animate-spin" /> Loading data...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (allActivityData.length === 0) {
     return (
      <Card className="shadow-lg col-span-1 md:col-span-2 lg:col-span-3">
        <CardHeader>
          <CardTitle className="text-xl flex items-center"><Activity className="mr-2 h-6 w-6 text-primary" /> Latest Domain Activity</CardTitle>
          <CardDescription>Overview of the most recently processed domains across your campaigns.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">No domain activity to display yet. Start a campaign!</p>
        </CardContent>
      </Card>
    );
  }

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalActivities);

  return (
    <Card className="shadow-xl col-span-1 md:col-span-2 lg:col-span-3">
      <CardHeader>
        <CardTitle className="text-xl flex items-center"><Activity className="mr-2 h-6 w-6 text-primary" /> Latest Domain Activity</CardTitle>
        <CardDescription>
          Overview of the most recently processed domains across your campaigns (showing up to {MAX_ITEMS_DISPLAY_INITIAL_LOAD} most recent).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[350px] w-full"> {/* Adjust height as needed */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Domain</TableHead>
                <TableHead>Generated</TableHead>
                <TableHead className="text-center">DNS</TableHead>
                <TableHead className="text-center">HTTP</TableHead>
                <TableHead className="text-center">Leads Status</TableHead>
                <TableHead className="text-center">Lead Score</TableHead>
                <TableHead>Campaign</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedActivities.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium hover:underline text-primary flex items-center"
                      title={`Visit ${item.domainName}`}
                    >
                      {item.domainName}
                      <ExternalLink className="ml-1.5 h-3.5 w-3.5 opacity-70" />
                    </a>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(item.generatedDate)}
                  </TableCell>
                  <TableCell className="text-center"><StatusBadge status={item.dnsStatus} /></TableCell>
                  <TableCell className="text-center"><StatusBadge status={item.httpStatus} /></TableCell>
                  <TableCell className="text-center"><StatusBadge status={item.leadScanStatus} /></TableCell>
                  <TableCell className="text-center">
                    {item.leadScore !== undefined ? (
                      <Badge variant={getSimilarityBadgeVariant(item.leadScore)} className="text-xs">
                        <Percent className="mr-1 h-3 w-3" /> 
                        {item.leadScore}%
                      </Badge>
                    ) : (
                      // Show a dash if lead scan was attempted but no score (e.g., No Leads, Failed, or N/A from lead scan)
                      // but not if it's still Pending for lead scan
                      item.leadScanStatus !== 'N/A' && item.leadScanStatus !== 'Pending' ? <span className="text-xs text-muted-foreground">-</span> : null
                    )}
                  </TableCell>
                  <TableCell>
                    <Link href={`/campaigns/${item.campaignId}?type=${getCampaignTypeFromActivity(item, [])}`} className="text-xs hover:underline text-muted-foreground">
                      {item.campaignName}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
               {paginatedActivities.length === 0 && totalActivities > 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No domains on this page.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>
        {/* Pagination Controls */}
        <div className="mt-4 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Rows per page:</span>
                <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
                    <SelectTrigger className="w-[70px] h-8 text-xs">
                        <SelectValue placeholder={pageSize} />
                    </SelectTrigger>
                    <SelectContent>
                        {GLOBAL_PAGE_SIZES.map(size => (
                            <SelectItem key={size} value={String(size)} className="text-xs">{size}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                 <span>Showing {totalActivities > 0 ? startItem : 0}-{endItem} of {totalActivities}</span>
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
      </CardContent>
    </Card>
  );
}

// Helper function to determine campaign type from activity, might need refinement based on how you store full campaign objects
// For now, it assumes the activity's campaignName or other properties can help infer it,
// or you might need to cross-reference with a list of all campaigns if available.
function getCampaignTypeFromActivity(activity: LatestDomainActivity, allCampaigns: Campaign[]): CampaignSelectedType | string {
    // A more robust way would be to have allCampaigns passed in or fetched and then look up by activity.campaignId
    // For simplicity, this is a placeholder. You'd look up campaign.selectedType.
    const campaign = allCampaigns.find(c => c.id === activity.campaignId);
    return campaign?.selectedType || "Unknown";
}
