
"use client";

import { useEffect, useState, useCallback } from 'react';
import PageHeader from '@/components/shared/PageHeader';
import ProxyListItem from '@/components/proxies/ProxyListItem';
import ProxyForm from '@/components/proxies/ProxyForm';
import StrictProtectedRoute from '@/components/auth/StrictProtectedRoute';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldCheck, PlusCircle, TestTubeDiagonal, Sparkles, Activity } from 'lucide-react';
import type { Proxy, ProxiesListResponse, ProxyActionResponse, ProxyDeleteResponse, UpdateProxyPayload } from '@/lib/types';
import { getProxies, deleteProxy, testProxy, testAllProxies, cleanProxies, updateProxy } from '@/lib/services/proxyService.production';
import { useToast } from '@/hooks/use-toast';
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

function ProxiesPageContent() {
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProxy, setEditingProxy] = useState<Proxy | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({}); // For individual proxy actions
  const [pageActionLoading, setPageActionLoading] = useState<string | null>(null); // For page-level actions

  const [proxyToDelete, setProxyToDelete] = useState<Proxy | null>(null);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  
  const { toast } = useToast();

  const fetchProxiesData = useCallback(async (showLoadingSpinner = true) => {
    if (showLoadingSpinner) setLoading(true);
    try {
      const response: ProxiesListResponse = await getProxies();
      if (response.status === 'success' && response.data) {
        setProxies(response.data);
      } else {
        toast({ title: "Error Loading Proxies", description: response.message || "Failed to load proxies.", variant: "destructive" });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      if (showLoadingSpinner) setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchProxiesData();
    const intervalId = setInterval(() => fetchProxiesData(false), 7000); // Poll for updates
    return () => clearInterval(intervalId);
  }, [fetchProxiesData]);

  const handleAddProxy = () => {
    setEditingProxy(null);
    setIsFormOpen(true);
  };

  const handleEditProxy = (proxy: Proxy) => {
    setEditingProxy(proxy);
    setIsFormOpen(true);
  };

  const handleFormSaveSuccess = () => {
    setIsFormOpen(false);
    setEditingProxy(null);
    fetchProxiesData(false); // Re-fetch without full loading spinner
    toast({ title: editingProxy ? "Proxy Updated" : "Proxy Added", description: `Proxy has been successfully ${editingProxy ? 'updated' : 'added'}.` });
  };
  
  const openDeleteConfirmation = (proxy: Proxy) => {
    setProxyToDelete(proxy);
    setIsConfirmDeleteOpen(true);
  };

  const handleDeleteProxy = async () => {
    if (!proxyToDelete) return;
    setActionLoading(prev => ({ ...prev, [`delete-${proxyToDelete.id}`]: true }));
    try {
      const response: ProxyDeleteResponse = await deleteProxy(proxyToDelete.id);
      if (response.status === 'success') {
        toast({ title: "Proxy Deleted", description: response.message });
        setProxies(prev => prev.filter(p => p.id !== proxyToDelete!.id));
      } else {
        toast({ title: "Error Deleting Proxy", description: response.message, variant: "destructive" });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setActionLoading(prev => ({ ...prev, [`delete-${proxyToDelete!.id}`]: false }));
      setIsConfirmDeleteOpen(false);
      setProxyToDelete(null);
    }
  };

  const handleTestProxy = async (proxyId: string) => {
    setActionLoading(prev => ({ ...prev, [`test-${proxyId}`]: true }));
    try {
      const response: ProxyActionResponse = await testProxy(proxyId);
      if (response.status === 'success' && response.data?.proxy) {
        toast({ title: "Proxy Test Completed", description: `Status: ${response.data.proxy.status}` });
        setProxies(prev => prev.map(p => p.id === proxyId ? response.data!.proxy! : p));
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
  
  const handleToggleProxyStatus = async (proxy: Proxy, newStatus: 'Active' | 'Disabled') => {
    setActionLoading(prev => ({ ...prev, [`toggle-${proxy.id}`]: true }));
    const payload: UpdateProxyPayload = { status: newStatus };
    try {
      const response = await updateProxy(proxy.id, payload);
      if (response.status === 'success' && response.data) {
        toast({ title: `Proxy ${newStatus === 'Active' ? 'Enabled' : 'Disabled'}`, description: `Proxy ${proxy.address} is now ${newStatus.toLowerCase()}.`});
        setProxies(prev => prev.map(p => p.id === proxy.id ? response.data! : p));
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


  const handleTestAllProxies = async () => {
    setPageActionLoading("testAll");
    try {
      const response: ProxyActionResponse = await testAllProxies();
      toast({ title: "Test All Proxies", description: response.message || "Testing process initiated/completed." });
      fetchProxiesData(false); // Refresh list to show updated statuses
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      toast({ title: "Error Testing All Proxies", description: message, variant: "destructive" });
    } finally {
      setPageActionLoading(null);
    }
  };

  const handleCleanProxies = async () => {
    setPageActionLoading("clean");
    try {
      const response: ProxyActionResponse = await cleanProxies();
      toast({ title: "Clean Proxies", description: response.message || "Cleaning process completed." });
      fetchProxiesData(false); // Refresh list
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      toast({ title: "Error Cleaning Proxies", description: message, variant: "destructive" });
    } finally {
      setPageActionLoading(null);
    }
  };
  
  const activeProxiesCount = proxies.filter(p => p.status === 'Active').length;

  return (
    <>
      <PageHeader
        title="Proxy Management"
        description="Configure, test, and manage your proxy servers."
        icon={ShieldCheck}
        actionButtons={
          <div className="flex gap-2">
            <Button onClick={handleAddProxy} disabled={!!pageActionLoading}>
              <PlusCircle className="mr-2" /> Add New Proxy
            </Button>
            <Button onClick={handleTestAllProxies} variant="outline" disabled={!!pageActionLoading || proxies.length === 0} isLoading={pageActionLoading === 'testAll'}>
              <TestTubeDiagonal className={cn("mr-2", pageActionLoading === 'testAll' && "animate-ping")}/> Test All
            </Button>
            <Button onClick={handleCleanProxies} variant="outline" disabled={!!pageActionLoading || proxies.length === 0} isLoading={pageActionLoading === 'clean'}>
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
          {[...Array(3)].map((_, i) => (
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
                        onTest={handleTestProxy}
                        onToggleStatus={handleToggleProxyStatus}
                        isLoading={actionLoading[`test-${proxy.id}`] || actionLoading[`toggle-${proxy.id}`] || actionLoading[`delete-${proxy.id}`]}
                      />
                    ))}
                  </TableBody>
                </Table>
            </CardContent>
        </Card>
      )}

      <Dialog open={isFormOpen} onOpenChange={(open) => { setIsFormOpen(open); if (!open) setEditingProxy(null); }}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>{editingProxy ? 'Edit Proxy' : 'Add New Proxy'}</DialogTitle>
            <DialogDescription>
              {editingProxy ? `Update details for ${editingProxy.address}.` : 'Configure a new proxy server.'}
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
            <AlertDialogAction onClick={handleDeleteProxy} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function ProxiesPage() {
  return (
    <StrictProtectedRoute
      requiredPermissions={['proxies:read']}
      redirectTo="/login"
    >
      <ProxiesPageContent />
    </StrictProtectedRoute>
  );
}
