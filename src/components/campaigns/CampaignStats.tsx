/**
 * Enhanced campaign statistics component with SafeBigInt support
 */

import React, { useMemo } from 'react';
import { CampaignViewModel } from '@/lib/types';
import { SafeBigInt } from '@/lib/types/branded';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProgressCountDisplay, AbbreviatedNumberDisplay, ItemCountDisplay } from '@/components/ui/BigIntDisplay';
import { Progress } from '@/components/ui/progress';
import { 
  Target, 
  CheckCircle, 
  XCircle, 
  Clock, 
  TrendingUp,
  Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface CampaignStatsProps {
  campaign: CampaignViewModel;
  className?: string;
  showDetailedStats?: boolean;
}

/**
 * Calculate percentage safely with SafeBigInt values
 */
function calculatePercentage(current: unknown, total: unknown): number {
  if (!current || !total) return 0;
  
  try {
    const currentBig = typeof current === 'bigint' ? current : BigInt(String(current));
    const totalBig = typeof total === 'bigint' ? total : BigInt(String(total));
    
    if (totalBig === BigInt(0)) return 0;
    
    const percent = Number((currentBig * BigInt(100)) / totalBig);
    return Math.min(100, Math.max(0, percent));
  } catch {
    return 0;
  }
}

/**
 * Main campaign statistics component
 */
export function CampaignStats({ 
  campaign, 
  className,
  showDetailedStats = true 
}: CampaignStatsProps) {
  const stats = useMemo(() => {
    const totalItems = campaign.totalItems || 0;
    const processedItems = campaign.processedItems || 0;
    const successfulItems = campaign.successfulItems || 0;
    const failedItems = campaign.failedItems || 0;
    
    // Calculate derived statistics
    const progressPercentage = calculatePercentage(processedItems, totalItems);
    const successRate = calculatePercentage(successfulItems, processedItems);
    const failureRate = calculatePercentage(failedItems, processedItems);
    const remainingItems = (() => {
      if (!totalItems || !processedItems) return 0;
      try {
        const totalBig = typeof totalItems === 'bigint' ? totalItems : BigInt(String(totalItems));
        const processedBig = typeof processedItems === 'bigint' ? processedItems : BigInt(String(processedItems));
        const remaining = totalBig - processedBig;
        return remaining > BigInt(0) ? (remaining as SafeBigInt) : 0; // Cast to SafeBigInt type
      } catch {
        return 0;
      }
    })();

    return {
      totalItems,
      processedItems,
      successfulItems,
      failedItems,
      remainingItems,
      progressPercentage,
      successRate,
      failureRate
    };
  }, [campaign]);

  return (
    <div className={cn('space-y-4', className)}>
      {/* Main Progress Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="h-5 w-5" />
            Campaign Progress
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">{stats.progressPercentage.toFixed(1)}%</span>
            </div>
            <Progress value={stats.progressPercentage} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <ProgressCountDisplay 
                current={stats.processedItems}
                total={stats.totalItems}
              />
              <span>
                <ItemCountDisplay value={stats.remainingItems} /> remaining
              </span>
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Successful
              </div>
              <div className="flex items-center gap-2">
                <AbbreviatedNumberDisplay 
                  value={stats.successfulItems}
                  className="text-lg font-semibold text-green-600"
                />
                <span className="text-xs text-muted-foreground">
                  ({stats.successRate.toFixed(1)}%)
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <XCircle className="h-4 w-4 text-red-500" />
                Failed
              </div>
              <div className="flex items-center gap-2">
                <AbbreviatedNumberDisplay 
                  value={stats.failedItems}
                  className="text-lg font-semibold text-red-600"
                />
                <span className="text-xs text-muted-foreground">
                  ({stats.failureRate.toFixed(1)}%)
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Statistics */}
      {showDetailedStats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Target className="h-4 w-4" />
                Total Items
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AbbreviatedNumberDisplay 
                value={stats.totalItems}
                className="text-2xl font-bold"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Items to process
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4" />
                Processed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AbbreviatedNumberDisplay 
                value={stats.processedItems}
                className="text-2xl font-bold"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Items completed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <TrendingUp className="h-4 w-4" />
                Success Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.successRate.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Of processed items
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

/**
 * Compact campaign statistics for list views
 */
export function CampaignStatsCompact({ 
  campaign, 
  className 
}: Omit<CampaignStatsProps, 'showDetailedStats'>) {
  const progressPercentage = useMemo(() => {
    return calculatePercentage(campaign.processedItems, campaign.totalItems);
  }, [campaign.processedItems, campaign.totalItems]);

  return (
    <div className={cn('flex items-center gap-4', className)}>
      <div className="flex-1 space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Progress</span>
          <span className="font-medium">{progressPercentage.toFixed(0)}%</span>
        </div>
        <Progress value={progressPercentage} className="h-1" />
      </div>
      
      <div className="text-right text-xs">
        <ProgressCountDisplay 
          current={campaign.processedItems}
          total={campaign.totalItems}
          className="text-xs"
        />
      </div>
    </div>
  );
}

/**
 * Campaign statistics summary for dashboards
 */
export function CampaignStatsSummary({ 
  campaign, 
  className 
}: Omit<CampaignStatsProps, 'showDetailedStats'>) {
  const stats = useMemo(() => ({
    progressPercentage: calculatePercentage(campaign.processedItems, campaign.totalItems),
    successRate: calculatePercentage(campaign.successfulItems, campaign.processedItems),
  }), [campaign]);

  return (
    <div className={cn('grid grid-cols-3 gap-4 text-center', className)}>
      <div>
        <div className="text-lg font-semibold">
          <AbbreviatedNumberDisplay value={campaign.totalItems} />
        </div>
        <div className="text-xs text-muted-foreground">Total</div>
      </div>
      
      <div>
        <div className="text-lg font-semibold">
          {stats.progressPercentage.toFixed(0)}%
        </div>
        <div className="text-xs text-muted-foreground">Progress</div>
      </div>
      
      <div>
        <div className="text-lg font-semibold">
          {stats.successRate.toFixed(0)}%
        </div>
        <div className="text-xs text-muted-foreground">Success</div>
      </div>
    </div>
  );
}
