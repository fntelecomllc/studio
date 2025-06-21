"use client";

import { useEffect, useState, useCallback } from 'react';
import PageHeader from '@/components/shared/PageHeader';
import ProxyListItem from '@/components/proxies/ProxyListItem';
import ProxyForm from '@/components/proxies/ProxyForm';
import { BulkOperations } from '@/components/proxies/BulkOperations';
import { ProxyTesting } from '@/components/proxies/ProxyTesting';
import StrictProtectedRoute from '@/components/auth/StrictProtectedRoute';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldCheck, PlusCircle, TestTubeDiagonal, Sparkles, Activity } from 'lucide-react';
import type { Proxy, ProxiesListResponse, ProxyActionResponse, ProxyDeleteResponse, UpdateProxyPayload } from '@/lib/types';
import { getProxies, deleteProxy, testProxy, testAllProxies, cleanProxies, updateProxy } from '@/lib/services/proxyService.production';
import { useToast } from '@/hooks/use-toast';
import { useProxyHealth } from '@/lib/hooks/useProxyHealth';
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
import { cn } from '@/lib/utils';
import { useLoadingStore, LOADING_OPERATIONS } from '@/lib/stores/loadingStore';

function ProxiesPageContent(): React.ReactElement {
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProxy, setEditingProxy] = useState<Proxy | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [pageActionLoading, setPageActionLoading] = useState<string | null>(null);

  const [proxyToDelete, setProxyToDelete] = useState<Proxy | null>(null);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  
  const { toast } = useToast();

  // Use centralized loading state and proxy health monitoring
  const { startLoading, stopLoading, isLoading } = useLoadingStore();
  const loading = isLoading(LOADING_OPERATIONS.FETCH_PROXIES);
  
  // Initialize proxy health monitoring for future use
  useProxyHealth({ 
    autoRefresh: true, 
    refreshInterval: 30000 
  });

  const fetchProxiesData = useCallback(async (showLoadingSpinner = true): Promise<void> => {
    if (showLoadingSpinner) startLoading(LOADING_OPERATIONS.FETCH_PROXIES, "Loading proxies");
    try {
      const response: ProxiesListResponse = await getProxies();
      if (response.status === 'success' && response.data !== null && response.data !== undefined) {
        setProxies(response.data);
      } else {
        toast({ title: "Error Loading Proxies", description: response.message !== null && response.message !== undefined && response.message !== '' ? response.message : "Failed to load proxies.", variant: "destructive" });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      if (showLoadingSpinner) stopLoading(LOADING_OPERATIONS.FETCH_PROXIES);
    }
  }, [toast, startLoading, stopLoading]);

  useEffect(() => {
    void fetchProxiesData();
    const intervalId = setInterval(() => void fetchProxiesData(false), 7000); // Poll for updates
    return () => clearInterval(intervalId);
  }, [fetchProxiesData]);

  const handleAddProxy = (): void => {
    setEditingProxy(null);
    setIsFormOpen(true);
  };

  const handleEditProxy = (proxy: Proxy): void => {
    setEditingProxy(proxy);
    setIsFormOpen(true);
  };

  const handleFormSaveSuccess = (): void => {
    setIsFormOpen(false);
    setEditingProxy(null);
    void fetchProxiesData(false); // Re-fetch without full loading spinner
    toast({ title: editingProxy !== null ? "Proxy Updated" : "Proxy Added", description: `Proxy has been successfully ${editingProxy !== null ? 'updated' : 'added'}.` });
  };
  
  const openDeleteConfirmation = (proxy: Proxy): void => {
    setProxyToDelete(proxy);
    setIsConfirmDeleteOpen(true);
  };

  const handleDeleteProxy = async (): Promise<void> => {
    if (proxyToDelete === null) return;
    setActionLoading(prev => ({ ...prev, [`delete-${proxyToDelete.id}`]: true }));
    try {
      const response: ProxyDeleteResponse = await deleteProxy(proxyToDelete.id);
      if (response.status === 'success') {
        toast({ title: "Proxy Deleted", description: response.message });
        setProxies(prev => prev.filter(p => p.id !== proxyToDelete.id));
      } else {
        toast({ title: "Error Deleting Proxy", description: response.message, variant: "destructive" });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setActionLoading(prev => ({ ...prev, [`delete-${proxyToDelete.id}`]: false }));
      setIsConfirmDeleteOpen(false);
      setProxyToDelete(null);
    }
  };

  const handleTestProxy = async (proxyId: string): Promise<void> => {
    setActionLoading(prev => ({ ...prev, [`test-${proxyId}`]: true }));
    try {
      const response: ProxyActionResponse = await testProxy(proxyId);
      if (response.status === 'success' && response.data !== null && response.data !== undefined) {
        toast({ title: "Proxy Test Completed", description: `Status: ${response.data.lastStatus !== null && response.data.lastStatus !== undefined && response.data.lastStatus !== '' ? response.data.lastStatus : 'Unknown'}` });
        setProxies(prev => prev.map(p => p.id === proxyId ? (response.data ?? p) : p));
      } else {
        toast({ title: "Proxy Test Failed", description: response.message, variant: "destructive" });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      toast({ title: "Error Testing Proxy", description: message, variant: "destructive" });
    } finally {
      setActionLoading(prev => ({ ...prev, [`test-${proxyId}`]: false }));
    }
  };
  
  const handleToggleProxyStatus = async (proxy: Proxy, newStatus: 'Active' | 'Disabled'): Promise<void> => {
    setActionLoading(prev => ({ ...prev, [`toggle-${proxy.id}`]: true }));
    const payload: UpdateProxyPayload = { isEnabled: newStatus === 'Active' };
    try {
      const response = await updateProxy(proxy.id, payload);
      if (response.status === 'success' && response.data !== null && response.data !== undefined) {
        toast({ title: `Proxy ${newStatus === 'Active' ? 'Enabled' : 'Disabled'}`, description: `Proxy ${proxy.address} is now ${newStatus.toLowerCase()}.`});
        setProxies(prev => prev.map(p => p.id === proxy.id ? (response.data ?? p) : p));
      } else {
        toast({ title: "Error Updating Proxy Status", description: response.message, variant: "destructive" });
      }
    } catch (err: unknown) {
       const message = err instanceof Error ? err.message : "An unexpected error occurred.";
       toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setActionLoading(prev => ({ ...prev, [`toggle-${proxy.id}`]: false }));
    }
  };


  const handleTestAllProxies = async (): Promise<void> => {
    setPageActionLoading("testAll");
    try {
      const response: ProxyActionResponse = await testAllProxies();
      toast({ title: "Test All Proxies", description: response.message !== null && response.message !== undefined && response.message !== '' ? response.message : "Testing process initiated/completed." });
      void fetchProxiesData(false); // Refresh list to show updated statuses
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      toast({ title: "Error Testing All Proxies", description: message, variant: "destructive" });
    } finally {
      setPageActionLoading(null);
    }
  };

  const handleCleanProxies = async (): Promise<void> => {
    setPageActionLoading("clean");
    try {
      const response: ProxyActionResponse = await cleanProxies();
      toast({ title: "Clean Proxies", description: response.message !== null && response.message !== undefined && response.message !== '' ? response.message : "Cleaning process completed." });
      void fetchProxiesData(false); // Refresh list
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      toast({ title: "Error Cleaning Proxies", description: message, variant: "destructive" });
    } finally {
      setPageActionLoading(null);
    }
  };
  
  const activeProxiesCount = proxies.filter(p => p.isEnabled).length;

  return (
    <>
      <PageHeader
        title="Proxy Management"
        description="Configure, test, and manage your proxy servers."
        icon={ShieldCheck}
        actionButtons={
          <div className="flex gap-2">
            <Button onClick={handleAddProxy} disabled={pageActionLoading !== null}>
              <PlusCircle className="mr-2" /> Add New Proxy
            </Button>
            <Button onClick={() => void handleTestAllProxies()} variant="outline" disabled={pageActionLoading !== null || proxies.length === 0} isLoading={pageActionLoading === 'testAll'}>
              <TestTubeDiagonal className={cn("mr-2", pageActionLoading === 'testAll' && "animate-ping")}/> Test All
            </Button>
            <Button onClick={() => void handleCleanProxies()} variant="outline" disabled={pageActionLoading !== null || proxies.length === 0} isLoading={pageActionLoading === 'clean'}>
              <Sparkles className={cn("mr-2", pageActionLoading === 'clean' && "animate-pulse")} /> Clean Failed
            </Button>
          </div>
        }
      />

      <Card className="mb-6 shadow-md">
        <CardHeader>
            <CardTitle className="text-lg flex items-center"><Activity className="mr-2 h-5 w-5 text-primary"/>Proxy Status Overview</CardTitle>
        </CardHeader>
        <CardContent>
            {loading ? <Skeleton className="h-6 w-1/2"/> : 
                <p className="text-muted-foreground">
                    <span className="font-semibold text-primary">{activeProxiesCount}</span> out of <span className="font-semibold">{proxies.length}</span> configured proxies are currently <span className={cn(activeProxiesCount > 0 ? "text-green-600" : "text-muted-foreground")}>active</span>.
                </p>
            }
        </CardContent>
      </Card>


      {loading ? (
        <div className="space-y-4">
          {Array.from({length: 3}).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-12 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : proxies.length === 0 ? (
        <Card className="text-center py-10 shadow-sm">
          <CardHeader>
             <ShieldCheck className="mx-auto h-12 w-12 text-muted-foreground" />
             <CardTitle className="mt-2 text-xl">No Proxies Configured</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Get started by adding your first proxy server.</p>
            <Button onClick={handleAddProxy} className="mt-4">
              <PlusCircle className="mr-2"/> Add Proxy
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-lg">
            <CardHeader>
                <CardTitle>Configured Proxies</CardTitle>
                <CardDescription>List of all proxy servers available for campaigns.</CardDescription>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue="allProxies" className="space-y-4">
                  <TabsList>
                    <TabsTrigger value="allProxies">All Proxies</TabsTrigger>
                    <TabsTrigger value="bulkOperations">Bulk Operations</TabsTrigger>
                    <TabsTrigger value="proxyTesting">Proxy Testing</TabsTrigger>
                  </TabsList>
                  <TabsContent value="allProxies">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[25%]">Address</TableHead>
                          <TableHead>Protocol</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Last Tested</TableHead>
                          <TableHead>Success/Fail</TableHead>
                          <TableHead>Last Error</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {proxies.map(proxy => (
                          <ProxyListItem
                            key={proxy.id}
                            proxy={proxy}
                            onEdit={handleEditProxy}
                            onDelete={openDeleteConfirmation}
                            onTest={(id) => void handleTestProxy(id)}
                            onToggleStatus={(proxy, status) => void handleToggleProxyStatus(proxy, status)}
                            isLoading={(actionLoading[`test-${proxy.id}`] ?? false) || (actionLoading[`toggle-${proxy.id}`] ?? false) || (actionLoading[`delete-${proxy.id}`] ?? false)}
                          />
                        ))}
                      </TableBody>
                    </Table>
                  </TabsContent>
                  <TabsContent value="bulkOperations">
                    <BulkOperations 
                      proxies={proxies}
                      onProxiesUpdate={() => void fetchProxiesData(false)}
                      disabled={pageActionLoading !== null}
                    />
                  </TabsContent>
                  <TabsContent value="proxyTesting">
                    <ProxyTesting 
                      proxies={proxies} 
                      onProxiesUpdate={() => void fetchProxiesData(false)}
                      disabled={pageActionLoading !== null}
                    />
                  </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
      )}

      <Dialog open={isFormOpen} onOpenChange={(open) => { setIsFormOpen(open); if (!open) setEditingProxy(null); }}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>{editingProxy !== null ? 'Edit Proxy' : 'Add New Proxy'}</DialogTitle>
            <DialogDescription>
              {editingProxy !== null ? `Update details for ${editingProxy.address}.` : 'Configure a new proxy server.'}
            </DialogDescription>
          </DialogHeader>
          <ProxyForm
            proxyToEdit={editingProxy}
            onSaveSuccess={handleFormSaveSuccess}
            onCancel={() => { setIsFormOpen(false); setEditingProxy(null); }}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={isConfirmDeleteOpen} onOpenChange={setIsConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this proxy?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Proxy &quot;{proxyToDelete?.address}&quot; will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setProxyToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDeleteProxy()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function ProxiesPage(): React.ReactElement {
  return (
    <StrictProtectedRoute
      requiredPermissions={['proxies:read']}
      redirectTo="/login"
    >
      <ProxiesPageContent />
    </StrictProtectedRoute>
  );
}
