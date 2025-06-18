
"use client";

import React, { memo, useMemo, useCallback } from 'react';
import type { Campaign, CampaignPhase, CampaignPhaseStatus } from '@/lib/types';
import { CAMPAIGN_PHASES_ORDERED } from '@/lib/constants';
import { CheckCircle, AlertTriangle, Clock, Loader2, WorkflowIcon, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface CampaignProgressProps {
  campaign: Campaign;
}

const phaseDisplayNames: Record<CampaignPhase, string> = {
  idle: "Campaign Start",
  domain_generation: "Domain Generation",
  dns_validation: "DNS Validation",
  http_keyword_validation: "HTTP Validation",
  lead_generation: "Lead Generation",
  completed: "Campaign Complete",
  // Legacy support
  Idle: "Campaign Start",
  DNSValidation: "DNS Validation",
  HTTPValidation: "HTTP Validation",
  LeadGeneration: "Lead Generation",
  Completed: "Campaign Complete",
};

// Memoized phase status icon component for better performance
const PhaseStatusIcon = memo(({ phase, status, isActivePhase, isCampaignIdle }: {
  phase: CampaignPhase;
  status: CampaignPhaseStatus;
  isActivePhase: boolean;
  isCampaignIdle: boolean;
}) => {
  if (isCampaignIdle && phase === "Idle") return <Play className="h-5 w-5 text-blue-500" />;
  if (status === 'Succeeded') return <CheckCircle className="h-5 w-5 text-green-500" />;
  if (status === 'Failed') return <AlertTriangle className="h-5 w-5 text-destructive" />;
  if (status === 'InProgress' && isActivePhase) return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
  if (status === 'Pending' && (isActivePhase || isCampaignIdle)) return <Clock className="h-5 w-5 text-muted-foreground" />;
  return <WorkflowIcon className="h-5 w-5 text-muted-foreground/50" />; // Default for phases not yet active or completed
});

PhaseStatusIcon.displayName = 'PhaseStatusIcon';

// Memoized phase item component to prevent unnecessary re-renders
const PhaseItem = memo(({
  phase,
  campaign,
  displayPhases,
  operationalPhasesForType: _operationalPhasesForType,
  isActivePhaseNode,
  isCampaignIdle,
  nodeStatus
}: {
  phase: CampaignPhase;
  campaign: Campaign;
  displayPhases: CampaignPhase[];
  operationalPhasesForType: CampaignPhase[];
  isActivePhaseNode: boolean;
  isCampaignIdle: boolean;
  nodeStatus: CampaignPhaseStatus;
}) => {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn(
          "relative z-10 flex flex-col items-center text-center group",
           // Adjust width distribution; might need fine-tuning based on max phases
          displayPhases.length <= 4 ? "w-1/4" : "w-1/5",
          (nodeStatus === 'Succeeded' || (isActivePhaseNode && nodeStatus !== 'Pending' && nodeStatus !== 'Failed') || (isCampaignIdle && phase === "Idle")) ? "text-foreground" : "text-muted-foreground"
        )}>
          <div className={cn(
            "flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all duration-300",
            nodeStatus === 'Succeeded' ? "bg-primary border-primary text-primary-foreground" :
            (isActivePhaseNode && nodeStatus === 'InProgress') ? "bg-blue-500 border-blue-500 text-white" :
            (isActivePhaseNode && nodeStatus === 'Failed') ? "bg-destructive border-destructive text-destructive-foreground" :
            (isCampaignIdle && phase === "Idle") ? "bg-blue-500 border-blue-500 text-white" : // Special for Idle start
            "bg-secondary border-border group-hover:border-muted-foreground"
          )}>
            <PhaseStatusIcon phase={phase} status={nodeStatus} isActivePhase={isActivePhaseNode} isCampaignIdle={isCampaignIdle && phase === "Idle"} />
          </div>
          <p className={cn(
              "mt-2 text-xs sm:text-sm font-medium transition-all duration-300",
               (nodeStatus === 'Succeeded' || (isActivePhaseNode && nodeStatus !== 'Pending' && nodeStatus !== 'Failed') || (isCampaignIdle && phase === "Idle")) ? "font-semibold" : "font-normal"
          )}>
            {phaseDisplayNames[phase]}
          </p>
          {isActivePhaseNode && campaign.phaseStatus !== "Succeeded" && campaign.phaseStatus !== "Failed" && campaign.currentPhase !== "Completed" && <p className="text-xs text-muted-foreground">{campaign.phaseStatus}</p>}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>{phaseDisplayNames[phase]}</p>
        Status: { isActivePhaseNode && phase !== "Idle" ? campaign.phaseStatus : nodeStatus}
      </TooltipContent>
    </Tooltip>
  );
});

PhaseItem.displayName = 'PhaseItem';

// Memoized main component for optimal performance
const CampaignProgress = memo(({ campaign }: CampaignProgressProps) => {
  const selectedType = campaign.selectedType || campaign.campaignType;
  
  // Memoize display phases calculation to prevent recalculation on every render
  const displayPhases = useMemo(() => {
    const orderedPhases = (CAMPAIGN_PHASES_ORDERED[selectedType] || []) as CampaignPhase[];
    return campaign.currentPhase === "Idle" ?
      ["Idle" as CampaignPhase, ...orderedPhases] :
      orderedPhases;
  }, [campaign.currentPhase, selectedType]);
  
  // Memoize operational phases for the selected type
  const operationalPhasesForType = useMemo(() => {
    return (CAMPAIGN_PHASES_ORDERED[selectedType] || []) as CampaignPhase[];
  }, [selectedType]);

  // Memoize current operational phase calculations
  const { currentOperationalPhase: _currentOperationalPhase, currentOperationalPhaseIndex } = useMemo(() => {
    const currentPhase = campaign.currentPhase === "Idle" ? null : campaign.currentPhase;
    const phaseIndex = currentPhase ? displayPhases.indexOf(currentPhase) : -1;
    return {
      currentOperationalPhase: currentPhase,
      currentOperationalPhaseIndex: phaseIndex
    };
  }, [campaign.currentPhase, displayPhases]);

  // Memoize node status calculation for each phase to avoid recalculation
  const getNodeStatus = useCallback((phase: CampaignPhase): CampaignPhaseStatus => {
    const isActivePhaseNode = phase === campaign.currentPhase;
    const isCampaignIdle = campaign.currentPhase === "Idle";
    const operationalPhaseIndexInType = operationalPhasesForType.indexOf(phase);

    if (isCampaignIdle) {
      return phase === "Idle" ? "Pending" : "Pending"; // Or 'Idle' for Idle phase itself
    } else if (campaign.currentPhase === "Completed") {
       return 'Succeeded'; // All operational phases are succeeded
    } else if (campaign.phaseStatus === "Failed" && isActivePhaseNode) {
       return 'Failed';
    } else if (operationalPhaseIndexInType !== -1 && campaign.currentPhase && operationalPhaseIndexInType < operationalPhasesForType.indexOf(campaign.currentPhase)) {
       return 'Succeeded'; // Phase is before the current active/failed one
    } else if (isActivePhaseNode) {
       return campaign.phaseStatus || 'Pending'; // Current phase takes its own status
    } else if (campaign.phaseStatus === 'Succeeded' && operationalPhaseIndexInType !== -1 && campaign.currentPhase && operationalPhaseIndexInType === operationalPhasesForType.indexOf(campaign.currentPhase)) {
       return 'Succeeded'; // Current phase has succeeded
    }
    return 'Pending';
  }, [campaign.currentPhase, campaign.phaseStatus, operationalPhasesForType]);

  // Memoize progress calculation
  const progressWidth = useMemo(() => {
    if (campaign.currentPhase === "Idle") return 0;
    if (campaign.currentPhase === "Completed") return 100;
    return Math.max(0, operationalPhasesForType.length > 1 ? (currentOperationalPhaseIndex / (operationalPhasesForType.length - 1)) * 100 : 0);
  }, [campaign.currentPhase, currentOperationalPhaseIndex, operationalPhasesForType.length]);
  
  return (
    <div className="space-y-6">
      {/* Single TooltipProvider wrapping all phase items for better performance */}
      <TooltipProvider>
        <div className="relative flex justify-between items-center mx-4"> {/* Added margin for edge nodes */}
          {displayPhases.map((phase: CampaignPhase) => {
            const isActivePhaseNode = phase === campaign.currentPhase;
            const isCampaignIdle = campaign.currentPhase === "Idle";
            const nodeStatus = getNodeStatus(phase);

            return (
              <PhaseItem
                key={phase}
                phase={phase}
                campaign={campaign}
                displayPhases={displayPhases}
                operationalPhasesForType={operationalPhasesForType}
                isActivePhaseNode={isActivePhaseNode}
                isCampaignIdle={isCampaignIdle}
                nodeStatus={nodeStatus}
              />
            );
          })}
          {displayPhases.length > 1 && (
              <div className="absolute top-5 left-0 right-0 h-1 bg-border -z-0 mx-[calc(5rem/(var(--phase-count,4)*2))] " style={{ '--phase-count': displayPhases.length } as React.CSSProperties}>
              <div
                  className="h-full bg-primary transition-all duration-500"
                  // Progress of the line itself. If Idle, 0. If completed, 100. Otherwise, based on current phase.
                  style={{ width: `${progressWidth}%` }}
              />
              </div>
          )}
        </div>
      </TooltipProvider>

      {campaign.phaseStatus === 'InProgress' && campaign.currentPhase !== "Idle" && (
        <div className="mt-4">
          <div className="flex justify-between text-sm mb-1">
            <span>Current Phase Progress ({campaign.currentPhase ? phaseDisplayNames[campaign.currentPhase] : 'Unknown'})</span>
            <span>{campaign.progress}%</span>
          </div>
          <Progress value={campaign.progress} className="w-full h-3 [&>div]:bg-gradient-to-r [&>div]:from-blue-400 [&>div]:to-blue-600" />
        </div>
      )}
       {campaign.currentPhase === "Completed" && (
        <div className="mt-4 text-center p-4 bg-green-50 dark:bg-green-900/30 rounded-md border border-green-200 dark:border-green-700">
          <CheckCircle className="h-10 w-10 text-green-600 dark:text-green-400 mx-auto mb-2"/>
          <h3 className="text-lg font-semibold text-green-700 dark:text-green-300">Campaign Completed</h3>
          <p className="text-sm text-green-600 dark:text-green-400">All phases for &quot;{campaign.name}&quot; finished successfully.</p>
        </div>
      )}
      {campaign.phaseStatus === 'Failed' && campaign.currentPhase !== "Idle" && (
         <div className="mt-4 text-center p-4 bg-red-50 dark:bg-red-900/30 rounded-md border border-red-200 dark:border-red-700">
          <AlertTriangle className="h-10 w-10 text-red-600 dark:text-red-400 mx-auto mb-2"/>
          <h3 className="text-lg font-semibold text-red-700 dark:text-red-300">Phase Failed</h3>
          <p className="text-sm text-red-600 dark:text-red-400">The {campaign.currentPhase ? phaseDisplayNames[campaign.currentPhase] : 'Unknown'} phase encountered an error.</p>
        </div>
      )}
    </div>
  );
});

CampaignProgress.displayName = 'CampaignProgress';

export default CampaignProgress;
