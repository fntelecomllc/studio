// src/components/proxies/BulkOperations.tsx
// Bulk proxy operations component with branded types integration

"use client";

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  PlayCircle, 
  StopCircle, 
  TestTubeDiagonal, 
  Trash2, 
  CheckSquare, 
  Square,
  Sparkles,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import type { Proxy, ProxyActionResponse, ProxyDeleteResponse, UpdateProxyPayload } from '@/lib/types';
import { testProxy, cleanProxies, updateProxy, deleteProxy } from '@/lib/services/proxyService.production';
import { useToast } from '@/hooks/use-toast';

export interface BulkOperationsProps {
  proxies: Proxy[];
  onProxiesUpdate: () => void;
  disabled?: boolean;
}

type BulkAction = 'enable' | 'disable' | 'test' | 'delete' | 'clean';

interface BulkOperationResult {
  success: boolean;
  successCount: number;
  errorCount: number;
  errors: string[];
}

export function BulkOperations({ proxies, onProxiesUpdate, disabled = false }: BulkOperationsProps) {
  const { toast } = useToast();
  
  const [selectedProxyIds, setSelectedProxyIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState<{ current: number; total: number } | null>(null);

  // Filter and count proxies by status
  const enabledProxies = proxies.filter(p => p.isEnabled);
  const disabledProxies = proxies.filter(p => !p.isEnabled);
  const failedProxies = proxies.filter(p => p.status === 'Failed');
  const activeProxies = proxies.filter(p => p.status === 'Active');

  const selectedProxies = proxies.filter(p => selectedProxyIds.has(p.id));
  const selectedCount = selectedProxyIds.size;
  const allSelected = proxies.length > 0 && selectedProxyIds.size === proxies.length;
  const noneSelected = selectedProxyIds.size === 0;

  /**
   * Toggle selection for all proxies
   */
  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedProxyIds(new Set());
    } else {
      setSelectedProxyIds(new Set(proxies.map(p => p.id)));
    }
  }, [allSelected, proxies]);

  /**
   * Toggle selection for a specific proxy
   */
  const toggleProxySelection = useCallback((proxyId: string) => {
    setSelectedProxyIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(proxyId)) {
        newSet.delete(proxyId);
      } else {
        newSet.add(proxyId);
      }
      return newSet;
    });
  }, []);

  /**
   * Select proxies by status
   */
  const selectByStatus = useCallback((status: 'active' | 'disabled' | 'failed' | 'enabled') => {
    let filteredProxies: Proxy[] = [];
    
    switch (status) {
      case 'active':
        filteredProxies = activeProxies;
        break;
      case 'disabled':
        filteredProxies = disabledProxies;
        break;
      case 'failed':
        filteredProxies = failedProxies;
        break;
      case 'enabled':
        filteredProxies = enabledProxies;
        break;
    }
    
    setSelectedProxyIds(new Set(filteredProxies.map(p => p.id)));
  }, [activeProxies, disabledProxies, failedProxies, enabledProxies]);

  /**
   * Execute bulk action with progress tracking
   */
  const executeBulkAction = useCallback(async (action: BulkAction): Promise<BulkOperationResult> => {
    const targetProxies = action === 'clean' ? failedProxies : selectedProxies;
    const total = targetProxies.length;
    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    setProcessingProgress({ current: 0, total });

    for (let i = 0; i < targetProxies.length; i++) {
      const proxy = targetProxies[i];
      
      if (!proxy) continue;
      
      try {
        let response: ProxyActionResponse | ProxyDeleteResponse;
        
        switch (action) {
          case 'enable': {
            const enablePayload: UpdateProxyPayload = { isEnabled: true };
            response = await updateProxy(proxy.id, enablePayload);
            break;
          }
            
          case 'disable': {
            const disablePayload: UpdateProxyPayload = { isEnabled: false };
            response = await updateProxy(proxy.id, disablePayload);
            break;
          }
            
          case 'test':
            response = await testProxy(proxy.id);
            break;
            
          case 'delete':
            response = await deleteProxy(proxy.id);
            break;
            
          case 'clean':
            // Clean is handled differently via cleanProxies API
            response = await cleanProxies();
            break;
            
          default:
            throw new Error(`Unknown action: ${action}`);
        }

        if (response.status === 'success') {
          successCount++;
        } else {
          errorCount++;
          errors.push(`${proxy.address}: ${response.message}`);
        }
      } catch (error) {
        errorCount++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`${proxy.address}: ${errorMessage}`);
      }
      
      setProcessingProgress({ current: i + 1, total });
      
      // Small delay to prevent overwhelming the backend
      if (i < targetProxies.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return {
      success: errorCount === 0,
      successCount,
      errorCount,
      errors
    };
  }, [selectedProxies, failedProxies]);

  /**
   * Handle bulk action execution
   */
  const handleBulkAction = useCallback(async (action: BulkAction) => {
    if (action !== 'clean' && noneSelected) {
      toast({
        title: "No Proxies Selected",
        description: "Please select at least one proxy to perform this action.",
        variant: "destructive"
      });
      return;
    }

    setBulkAction(action);
    setIsConfirmationOpen(true);
  }, [noneSelected, toast]);

  /**
   * Confirm and execute bulk action
   */
  const confirmBulkAction = useCallback(async () => {
    if (!bulkAction) return;

    setIsConfirmationOpen(false);
    setIsProcessing(true);

    try {
      const result = await executeBulkAction(bulkAction);
      
      // Clear selection after successful operations
      if (result.success) {
        setSelectedProxyIds(new Set());
      }
      
      // Show results toast
      if (result.success) {
        toast({
          title: "Bulk Operation Completed",
          description: `Successfully ${bulkAction === 'clean' ? 'cleaned' : `${bulkAction}d`} ${result.successCount} proxy${result.successCount !== 1 ? 'ies' : 'y'}.`,
          variant: "default"
        });
      } else {
        toast({
          title: "Bulk Operation Partially Failed",
          description: `${result.successCount} succeeded, ${result.errorCount} failed. Check details for more information.`,
          variant: "destructive"
        });
        
        // Log detailed errors
        console.error('Bulk operation errors:', result.errors);
      }
      
      // Refresh proxy data
      onProxiesUpdate();
      
    } catch (error) {
      console.error('Bulk operation failed:', error);
      toast({
        title: "Bulk Operation Failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
      setProcessingProgress(null);
      setBulkAction(null);
    }
  }, [bulkAction, executeBulkAction, onProxiesUpdate, toast]);

  const getActionDescription = (action: BulkAction): string => {
    switch (action) {
      case 'enable':
        return `enable ${selectedCount} selected proxy${selectedCount !== 1 ? 'ies' : 'y'}`;
      case 'disable':
        return `disable ${selectedCount} selected proxy${selectedCount !== 1 ? 'ies' : 'y'}`;
      case 'test':
        return `test ${selectedCount} selected proxy${selectedCount !== 1 ? 'ies' : 'y'}`;
      case 'delete':
        return `permanently delete ${selectedCount} selected proxy${selectedCount !== 1 ? 'ies' : 'y'}`;
      case 'clean':
        return `remove all ${failedProxies.length} failed proxy${failedProxies.length !== 1 ? 'ies' : 'y'}`;
      default:
        return 'perform this action';
    }
  };

  return (
    <>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center">
            <CheckSquare className="mr-2 h-5 w-5 text-primary" />
            Bulk Operations
          </CardTitle>
          <CardDescription>
            Select multiple proxies and perform actions on them simultaneously.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Selection Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleSelectAll}
              disabled={disabled || proxies.length === 0}
            >
              {allSelected ? <Square className="h-4 w-4" /> : <CheckSquare className="h-4 w-4" />}
              <span className="ml-1">
                {allSelected ? 'Deselect All' : 'Select All'}
              </span>
            </Button>
            
            <Select onValueChange={selectByStatus} disabled={disabled}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Quick Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active ({activeProxies.length})</SelectItem>
                <SelectItem value="enabled">Enabled ({enabledProxies.length})</SelectItem>
                <SelectItem value="disabled">Disabled ({disabledProxies.length})</SelectItem>
                <SelectItem value="failed">Failed ({failedProxies.length})</SelectItem>
              </SelectContent>
            </Select>
            
            <Badge variant="outline">
              {selectedCount} selected
            </Badge>
          </div>

          {/* Bulk Action Buttons */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulkAction('enable')}
              disabled={disabled || noneSelected || isProcessing}
            >
              <PlayCircle className="h-4 w-4 mr-1" />
              Enable
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulkAction('disable')}
              disabled={disabled || noneSelected || isProcessing}
            >
              <StopCircle className="h-4 w-4 mr-1" />
              Disable
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulkAction('test')}
              disabled={disabled || noneSelected || isProcessing}
            >
              <TestTubeDiagonal className="h-4 w-4 mr-1" />
              Test
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulkAction('clean')}
              disabled={disabled || failedProxies.length === 0 || isProcessing}
            >
              <Sparkles className="h-4 w-4 mr-1" />
              Clean Failed ({failedProxies.length})
            </Button>
            
            <Button
              variant="destructive"
              size="sm"
              onClick={() => handleBulkAction('delete')}
              disabled={disabled || noneSelected || isProcessing}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          </div>

          {/* Processing Progress */}
          {isProcessing && processingProgress && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>
                Processing: {processingProgress.current} / {processingProgress.total}
              </span>
            </div>
          )}

          {/* Proxy Selection Checkboxes */}
          {proxies.length > 0 && (
            <div className="border rounded-lg p-3 max-h-64 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {proxies.map(proxy => (
                  <div
                    key={proxy.id}
                    className="flex items-center space-x-2 p-2 rounded border hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={selectedProxyIds.has(proxy.id)}
                      onCheckedChange={() => toggleProxySelection(proxy.id)}
                      disabled={disabled || isProcessing}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{proxy.address}</p>
                      <div className="flex items-center gap-1">
                        <Badge
                          variant={proxy.status === 'Active' ? 'default' : 
                                  proxy.status === 'Failed' ? 'destructive' : 'secondary'}
                          className="text-xs"
                        >
                          {proxy.status}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {proxy.protocol}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <AlertDialog open={isConfirmationOpen} onOpenChange={setIsConfirmationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirm Bulk Action
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to {bulkAction ? getActionDescription(bulkAction) : 'perform this action'}?
              {bulkAction === 'delete' && (
                <span className="block mt-2 text-destructive font-medium">
                  This action cannot be undone.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkAction}
              className={bulkAction === 'delete' ? 'bg-destructive hover:bg-destructive/90' : ''}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
