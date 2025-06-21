
"use client";

import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Persona, HttpPersona, DnsPersona, PersonaStatus } from '@/lib/types';
import { FilePenLine, Trash2, MoreVertical, Copy, Globe, Tag, Clock, Settings2, Wifi, TestTubeDiagonal, Power, PowerOff, FileJson, AlertCircle, CheckCircle, HelpCircle, Loader2 } from 'lucide-react';
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
} from "@/components/ui/alert-dialog"
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { format, formatDistance } from 'date-fns';

interface PersonaListItemProps {
  persona: Persona;
  onDelete: (personaId: string, personaType: 'http' | 'dns') => void;
  onTest: (personaId: string, personaType: 'http' | 'dns') => void;
  onToggleStatus: (personaId: string, personaType: 'http' | 'dns', newStatus: PersonaStatus) => void;
  isTesting: boolean;
  isTogglingStatus: boolean;
}

const getStatusBadgeInfo = (status: PersonaStatus | undefined): { variant: "default" | "secondary" | "destructive" | "outline", icon: JSX.Element, text: string } => {
  status = status || 'Active'; // Default to Active if undefined for some reason
  switch (status) {
    case 'Active':
      return { variant: 'default', icon: <CheckCircle className="h-3.5 w-3.5 text-green-500" />, text: 'Active' };
    case 'Disabled':
      return { variant: 'secondary', icon: <PowerOff className="h-3.5 w-3.5 text-muted-foreground" />, text: 'Disabled' };
    case 'Testing':
      return { variant: 'outline', icon: <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />, text: 'Testing' };
    case 'Failed':
      return { variant: 'destructive', icon: <AlertCircle className="h-3.5 w-3.5 text-destructive" />, text: 'Test Failed' };
    default:
      return { variant: 'outline', icon: <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />, text: status };
  }
};


export default function PersonaListItem({ persona, onDelete, onTest, onToggleStatus, isTesting, isTogglingStatus }: PersonaListItemProps) {
  const { toast } = useToast();
  const statusInfo = getStatusBadgeInfo(persona.status as PersonaStatus);

  const handleDelete = () => {
    onDelete(persona.id, persona.personaType);
  };

  const handleExport = () => {
    try {
      // Create a new object for export, omitting 'personaType' if it's http, and flattening 'config' for dns
      const exportablePersona: Record<string, unknown> = { ...persona };
      if (persona.personaType === 'http') {
        // delete exportablePersona.personaType; // Optional: remove if not desired in export
      } else if (persona.personaType === 'dns') {
        // For DNS, the 'config' object is already structured as desired for export.
        // No need to flatten 'config' into the root of exportablePersona.
        // We want to export the full DnsPersona structure including the nested config.
      }


      const personaJson = JSON.stringify(exportablePersona, null, 2);
      const blob = new Blob([personaJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${persona.name.replace(/\s+/g, '_')}_persona.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Persona Exported", description: `${persona.name} has been exported.` });
    } catch (error) {
      toast({ title: "Export Failed", description: "Could not export persona.", variant: "destructive" });
      console.error("Persona export error:", error);
    }
  };

  const copyToClipboard = (data: unknown, fieldName: string) => {
    if (data === undefined || data === null || (typeof data === 'object' && Object.keys(data).length === 0)) {
        toast({ title: `Copy Failed`, description: `${fieldName} is empty or not available.`, variant: "destructive" });
        return;
    }
    const textToCopy = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    navigator.clipboard.writeText(textToCopy).then(() => {
      toast({ title: `${fieldName} Copied`, description: `${fieldName} copied to clipboard.` });
    }).catch(() => {
      toast({ title: `Copy Failed`, description: `Could not copy ${fieldName} to clipboard.`, variant: "destructive" });
    });
  };

  const renderHttpPersonaDetails = (p: HttpPersona) => {
    const config = p.configDetails as import('@/lib/types').HTTPConfigDetails;
    return (
      <>
        <div className="text-sm space-y-1 mb-3">
          <div><strong>User-Agent:</strong> <p className="font-mono text-xs truncate block ml-1" title={config.userAgent}>{config.userAgent || "Not set"}</p></div>
          
          <div className="flex items-center mt-1"><strong>Allow Insecure TLS:</strong>
            <Badge variant={config.allowInsecureTls ? "destructive" : "secondary"} className="ml-2 text-xs">{config.allowInsecureTls ? "Yes" : "No"}</Badge>
          </div>
          <p><strong>Timeout:</strong> {config.requestTimeoutSec || config.requestTimeoutSeconds}s</p>
          <p><strong>Redirects:</strong> {config.maxRedirects}</p>
          {config.cookieHandling?.mode && <p><strong>Cookie Handling:</strong> {config.cookieHandling.mode}</p>}
          {config.notes && <p><strong>Notes:</strong> <span className="text-muted-foreground italic truncate" title={config.notes}>{config.notes}</span></p>}
        </div>
        <Separator className="my-3" />
        <div className="space-y-2">
          {config.headers && Object.keys(config.headers).length > 0 &&
              <Button variant="outline" size="sm" onClick={() => copyToClipboard(config.headers, "HTTP Headers")} className="w-full justify-start text-left text-xs">
                <Copy className="mr-2 h-3 w-3"/> Copy HTTP Headers ({Object.keys(config.headers).length} headers)
              </Button>
          }
          {config.tlsClientHello && Object.keys(config.tlsClientHello).length > 0 &&
              <Button variant="outline" size="sm" onClick={() => copyToClipboard(config.tlsClientHello, "TLS ClientHello Config")} className="w-full justify-start text-left text-xs">
                <Copy className="mr-2 h-3 w-3"/> Copy TLS Config
              </Button>
          }
          {config.http2Settings && Object.keys(config.http2Settings).length > 0 &&
              <Button variant="outline" size="sm" onClick={() => copyToClipboard(config.http2Settings, "HTTP/2 Settings")} className="w-full justify-start text-left text-xs">
                <Copy className="mr-2 h-3 w-3"/> Copy HTTP/2 Config
              </Button>
          }
        </div>
      </>
    );
  };

  const renderDnsPersonaDetails = (p: DnsPersona) => {
    const config = p.configDetails as import('@/lib/types').DNSConfigDetails;
    return (
      <>
        <div className="text-sm space-y-1 mb-3">
          <div><strong>Strategy:</strong> <Badge variant="secondary" className="ml-2 text-xs">{config.resolverStrategy.replace(/_/g, ' ')}</Badge></div>
          <p><strong>Timeout:</strong> {config.queryTimeoutSeconds}s</p>
          <p><strong>Concurrent Queries/Domain:</strong> {config.concurrentQueriesPerDomain}</p>
          <p><strong>Max Goroutines:</strong> {config.maxConcurrentGoroutines}</p>
          {(config.queryDelayMinMs !== undefined && config.queryDelayMaxMs !== undefined) && <p><strong>Query Delay:</strong> {config.queryDelayMinMs}-{config.queryDelayMaxMs}ms</p>}
          {config.useSystemResolvers && <p><strong>Uses System Resolvers:</strong> Yes</p>}
          {config.maxDomainsPerRequest && <p><strong>Max Domains/Request:</strong> {config.maxDomainsPerRequest}</p>}
          {config.rateLimitDps && <p><strong>Rate Limit (DPS):</strong> {config.rateLimitDps}</p>}
          {config.rateLimitBurst && <p><strong>Rate Limit Burst:</strong> {config.rateLimitBurst}</p>}
          {config.resolvers && config.resolvers.length > 0 && (
              <div className="mt-1">
                  <strong>Resolvers:</strong>
                  <p className="text-xs font-mono truncate ml-1" title={config.resolvers.join(', ')}>{config.resolvers.join(', ').substring(0,35)}{config.resolvers.join(', ').length > 35 ? '...' : ''}</p>
              </div>
          )}
        </div>
        <Separator className="my-3" />
         <div className="space-y-2">
           <Button variant="outline" size="sm" onClick={() => copyToClipboard(config, "Full DNS Config")} className="w-full justify-start text-left text-xs">
                <Copy className="mr-2 h-3 w-3"/> Copy Full DNS Config
              </Button>
        </div>
      </>
    );
  };

  const isActionDisabled = isTesting || isTogglingStatus;

  return (
    <Card className="shadow-md hover:shadow-lg transition-shadow duration-200 flex flex-col h-full">
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            {persona.personaType === 'http' ? <Globe className="h-5 w-5 text-primary" /> : <Wifi className="h-5 w-5 text-primary" />}
            {persona.name}
          </CardTitle>
          <CardDescription className="line-clamp-2 text-xs mt-1">{persona.description || "No description provided."}</CardDescription>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" disabled={isActionDisabled}>
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">More actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild disabled={isActionDisabled}>
              <Link href={`/personas/${persona.id}/edit?type=${persona.personaType}`} className="flex items-center">
                <FilePenLine className="mr-2 h-4 w-4" /> Edit
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onTest(persona.id, persona.personaType)} disabled={isActionDisabled || persona.status === 'Testing'}>
              {isTesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TestTubeDiagonal className="mr-2 h-4 w-4" />} Test Persona
            </DropdownMenuItem>
            {persona.status !== 'Disabled' && (
                <DropdownMenuItem onClick={() => onToggleStatus(persona.id, persona.personaType, 'Disabled')} disabled={isActionDisabled || persona.status === 'Testing'}>
                   {isTogglingStatus ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PowerOff className="mr-2 h-4 w-4" />} Disable Persona
                </DropdownMenuItem>
            )}
            {persona.status === 'Disabled' && (
                 <DropdownMenuItem onClick={() => onToggleStatus(persona.id, persona.personaType, 'Active')} disabled={isActionDisabled}>
                    {isTogglingStatus ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Power className="mr-2 h-4 w-4" />} Enable Persona
                </DropdownMenuItem>
            )}
             <DropdownMenuItem onClick={handleExport} disabled={isActionDisabled}>
              <FileJson className="mr-2 h-4 w-4" /> Export JSON
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <AlertDialog>
                <AlertDialogTrigger asChild>
                <DropdownMenuItem 
                    className="flex items-center text-destructive hover:!bg-destructive hover:!text-destructive-foreground focus:!bg-destructive focus:!text-destructive-foreground"
                    disabled={isActionDisabled}
                    onSelect={(e) => e.preventDefault()} // Prevents dropdown from closing
                >
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                </DropdownMenuItem>
                </AlertDialogTrigger>
                <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the persona
                    &quot;{persona.name}&quot;.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className={cn(buttonVariants({variant: "destructive"}))}>
                    Delete
                    </AlertDialogAction>
                </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="text-sm flex-grow pt-0 space-y-3">
        <div className="flex items-center justify-between text-xs mb-2">
            <Badge variant={statusInfo.variant} className="text-xs py-0.5 px-1.5">
                {statusInfo.icon}
                <span className="ml-1">{statusInfo.text}</span>
            </Badge>
            {persona.lastTested && (
                <span className="text-muted-foreground">
                    Tested: {formatDistance(new Date(persona.lastTested), new Date(), { addSuffix: true })}
                </span>
            )}
        </div>
        {persona.lastError && <p className="text-xs text-destructive mb-1" title={persona.lastError}>Error: {persona.lastError.substring(0,50)}{persona.lastError.length > 50 ? '...' : ''}</p>}

        {persona.personaType === 'http' ? renderHttpPersonaDetails(persona as HttpPersona) : renderDnsPersonaDetails(persona as DnsPersona)}
        
        {persona.tags && persona.tags.length > 0 && (
          <div className="mt-2">
            <Separator className="my-2" />
            <h4 className="font-semibold text-xs text-muted-foreground mb-1 flex items-center"><Tag className="mr-1 h-3 w-3"/>Tags:</h4>
            <div className="flex flex-wrap gap-1">
              {persona.tags.map(tag => <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>)}
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="text-xs text-muted-foreground border-t pt-3">
        <div className="flex items-center">
          <Clock className="mr-1.5 h-3 w-3" />
          Created: {persona.createdAt ? format(new Date(persona.createdAt), 'PP') : 'N/A'}
        </div>
         {persona.updatedAt && persona.updatedAt !== persona.createdAt && (
           <div className="flex items-center ml-auto">
            <Settings2 className="mr-1.5 h-3 w-3" />
             Updated: {format(new Date(persona.updatedAt), 'PP')}
           </div>
         )}
      </CardFooter>
    </Card>
  );
}
    

    
