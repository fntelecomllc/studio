
"use client";

import React, { memo, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { Campaign } from '@/lib/types';
import { ArrowRight, CalendarDays, CheckCircle, AlertTriangle, WorkflowIcon, Play, MoreVertical, FilePenLine, Trash2, PauseCircle, PlayCircle, StopCircle, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CAMPAIGN_PHASES_ORDERED, getNextPhase } from '@/lib/constants';

interface CampaignListItemProps {
  campaign: Campaign;
  onDeleteCampaign: (campaignId: string) => void;
  onPauseCampaign?: (campaignId: string) => void;
  onResumeCampaign?: (campaignId: string) => void;
  onStopCampaign?: (campaignId: string) => void;
  isActionLoading?: Record<string, boolean>;
}

// Memoized utility functions for better performance
const formatDate = (dateString: string): string => {
  if (!dateString) return 'N/A';
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return 'Invalid Date';
  }
};

// Memoized progress calculation function
const getOverallCampaignProgress = (campaign: Campaign): number => {
  const selectedType = campaign.selectedType || campaign.campaignType;
  const phasesForType = CAMPAIGN_PHASES_ORDERED[selectedType];
  if (!phasesForType || phasesForType.length === 0) return 0;

  if (campaign.currentPhase === "Completed") return 100;
  
  if (campaign.phaseStatus === "Paused" || campaign.phaseStatus === "Failed" || campaign.currentPhase === "Idle") {
    // For paused or failed, progress reflects where it stopped. For Idle, it's 0.
    const currentPhaseIndexInType = campaign.currentPhase ? phasesForType.indexOf(campaign.currentPhase) : -1;
     if(campaign.currentPhase === "Idle" || currentPhaseIndexInType === -1) return 0;

    const completedPhasesProgress = (currentPhaseIndexInType / phasesForType.length) * 100;
    const currentPhaseProgressContribution = ((campaign.progress || 0) / phasesForType.length);
    return Math.min(100, Math.floor(completedPhasesProgress + currentPhaseProgressContribution));
  }

  const currentPhaseIndexInType = campaign.currentPhase ? phasesForType.indexOf(campaign.currentPhase) : -1;
  if (currentPhaseIndexInType === -1) return 0; // Should not happen if not Idle/Failed/Paused

  const completedPhasesProgress = (currentPhaseIndexInType / phasesForType.length) * 100;
  const currentPhaseProgressContribution = ((campaign.progress || 0) / phasesForType.length);

  return Math.min(100, Math.floor(completedPhasesProgress + currentPhaseProgressContribution));
};

// Memoized status badge info generation
const getStatusBadgeInfo = (campaign: Campaign): { text: string, variant: "default" | "secondary" | "destructive" | "outline", icon: JSX.Element } => {
  if (campaign.currentPhase === "Completed") return { text: "Completed", variant: "default", icon: <CheckCircle className="h-4 w-4 text-green-500" /> };
  if (campaign.phaseStatus === "Failed") return { text: `Failed: ${campaign.currentPhase || 'Unknown'}`, variant: "destructive", icon: <AlertTriangle className="h-4 w-4 text-destructive" /> };
  if (campaign.phaseStatus === "Paused") return { text: `Paused: ${campaign.currentPhase || 'Unknown'}`, variant: "outline", icon: <PauseCircle className="h-4 w-4 text-muted-foreground" /> };
  if (campaign.phaseStatus === "InProgress") return { text: `Active: ${campaign.currentPhase || 'Unknown'}`, variant: "secondary", icon: <Loader2 className="h-4 w-4 text-blue-500 animate-spin" /> };
  if (campaign.currentPhase === "Idle" || campaign.phaseStatus === "Pending") return { text: "Pending Start", variant: "outline", icon: <Play className="h-4 w-4 text-muted-foreground" /> };
  if (campaign.phaseStatus === "Succeeded") {
     const selectedType = campaign.selectedType || campaign.campaignType;
     const nextPhase = selectedType && campaign.currentPhase ? getNextPhase(selectedType, campaign.currentPhase) : null;
     return { text: `Next: ${nextPhase || 'Finalizing'}`, variant: "secondary", icon: <WorkflowIcon className="h-4 w-4 text-muted-foreground" /> };
  }
  return { text: campaign.currentPhase || 'Unknown', variant: "outline", icon: <WorkflowIcon className="h-4 w-4 text-muted-foreground" /> };
};


// Memoized main component with optimized performance
const CampaignListItem = memo(({ campaign, onDeleteCampaign, onPauseCampaign, onResumeCampaign, onStopCampaign, isActionLoading = {} }: CampaignListItemProps) => {
  // Memoize expensive calculations to prevent recalculation on every render
  const overallProgress = useMemo(() => getOverallCampaignProgress(campaign), [campaign]);
  const statusInfo = useMemo(() => getStatusBadgeInfo(campaign), [campaign]);
  const formattedDate = useMemo(() => formatDate(campaign.createdAt), [campaign.createdAt]);

  // Memoize loading states to prevent object recreation
  const loadingStates = useMemo(() => ({
    isDeleting: !!isActionLoading[`delete-${campaign.id}`],
    isPausing: !!isActionLoading[`pause-${campaign.id}`],
    isResuming: !!isActionLoading[`resume-${campaign.id}`],
    isStopping: !!isActionLoading[`stop-${campaign.id}`]
  }), [isActionLoading, campaign.id]);

  // Memoize combined loading state
  const anyActionLoading = useMemo(() => {
    return loadingStates.isDeleting || loadingStates.isPausing || loadingStates.isResuming || loadingStates.isStopping;
  }, [loadingStates]);

  // Memoize action handlers to prevent re-creation on every render
  const handleDeleteCampaign = useCallback(() => {
    onDeleteCampaign(campaign.id);
  }, [onDeleteCampaign, campaign.id]);

  const handlePauseCampaign = useCallback(() => {
    onPauseCampaign?.(campaign.id);
  }, [onPauseCampaign, campaign.id]);

  const handleResumeCampaign = useCallback(() => {
    onResumeCampaign?.(campaign.id);
  }, [onResumeCampaign, campaign.id]);

  const handleStopCampaign = useCallback(() => {
    onStopCampaign?.(campaign.id);
  }, [onStopCampaign, campaign.id]);

  // Memoize conditional rendering flags
  const showActions = useMemo(() => ({
    showPause: campaign.phaseStatus === 'InProgress' && onPauseCampaign,
    showResume: campaign.phaseStatus === 'Paused' && onResumeCampaign,
    showStop: (campaign.phaseStatus === 'InProgress' || campaign.phaseStatus === 'Paused') && onStopCampaign
  }), [campaign.phaseStatus, onPauseCampaign, onResumeCampaign, onStopCampaign]);

  return (
    <AlertDialog>
      <Card className="shadow-md hover:shadow-lg transition-shadow duration-200 flex flex-col h-full">
        <CardHeader>
          <div className="flex justify-between items-start">
            <CardTitle className="text-xl mb-1">{campaign.name}</CardTitle>
            <div className="flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant={statusInfo.variant} className="cursor-default">
                      {statusInfo.icon}
                      <span className="ml-1.5">{statusInfo.text}</span>
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Type: {campaign.selectedType}</p>
                    <p>Phase: {campaign.currentPhase}</p>
                    <p>Status: {campaign.phaseStatus}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" disabled={anyActionLoading}>
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild disabled={anyActionLoading}>
                    <Link href={`/campaigns/${campaign.id}/edit`}>
                      <FilePenLine className="mr-2 h-4 w-4" /> Edit
                    </Link>
                  </DropdownMenuItem>

                  {showActions.showPause && (
                    <DropdownMenuItem onClick={handlePauseCampaign} disabled={anyActionLoading || loadingStates.isPausing}>
                      <PauseCircle className="mr-2 h-4 w-4" /> Pause
                      <span className="text-xs ml-1 text-muted-foreground">(API: /pause)</span>
                    </DropdownMenuItem>
                  )}
                  {showActions.showResume && (
                     <DropdownMenuItem onClick={handleResumeCampaign} disabled={anyActionLoading || loadingStates.isResuming}>
                       <PlayCircle className="mr-2 h-4 w-4" /> Resume
                       <span className="text-xs ml-1 text-muted-foreground">(API: /resume)</span>
                     </DropdownMenuItem>
                  )}
                  {showActions.showStop && (
                    <DropdownMenuItem onClick={handleStopCampaign} className="text-amber-600 focus:text-amber-100 focus:bg-amber-500" disabled={anyActionLoading || loadingStates.isStopping}>
                      <StopCircle className="mr-2 h-4 w-4" /> Stop
                      <span className="text-xs ml-1 text-muted-foreground">(API: /stop)</span>
                    </DropdownMenuItem>
                  )}
                  {(showActions.showPause || showActions.showResume || showActions.showStop) && <DropdownMenuSeparator />}

                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem className="text-destructive hover:!bg-destructive hover:!text-destructive-foreground focus:!bg-destructive focus:!text-destructive-foreground" disabled={anyActionLoading} onSelect={(e) => e.preventDefault()}>
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <CardDescription className="line-clamp-2">{campaign.description || "No description."}</CardDescription>
        </CardHeader>
        <CardContent className="flex-grow space-y-3">
          <div>
            <div className="flex justify-between items-center mb-1 text-sm">
              <span className="font-medium text-muted-foreground">Overall Progress</span>
            </div>
            <Progress value={overallProgress} className="h-2 [&>div]:bg-gradient-to-r [&>div]:from-primary [&>div]:to-accent" />
            <p className="text-xs text-muted-foreground mt-1 text-right">{overallProgress}% complete</p>
          </div>
          <div className="text-sm text-muted-foreground">
            <strong>Type:</strong> {campaign.selectedType}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row justify-between items-center gap-2 border-t pt-4">
          <div className="text-xs text-muted-foreground flex items-center">
            <CalendarDays className="mr-1.5 h-3.5 w-3.5" /> Created: {formattedDate}
          </div>
          <Button asChild size="sm" variant="outline" disabled={anyActionLoading}>
            <Link href={`/campaigns/${campaign.id}`} aria-disabled={anyActionLoading}>
              View Dashboard <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardFooter>
      </Card>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. Campaign &quot;{campaign.name}&quot; will be permanently deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDeleteCampaign} className={buttonVariants({ variant: "destructive" })}>
            Delete Campaign
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
});

CampaignListItem.displayName = 'CampaignListItem';

export default CampaignListItem;
