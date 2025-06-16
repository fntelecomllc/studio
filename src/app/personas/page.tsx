"use client";

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/shared/PageHeader';
import PersonaListItem from '@/components/personas/PersonaListItem';
import StrictProtectedRoute from '@/components/auth/StrictProtectedRoute';
import type { Persona, HttpPersona, DnsPersona, CreateHttpPersonaPayload, CreateDnsPersonaPayload, PersonasListResponse, PersonaDeleteResponse, PersonaActionResponse, PersonaStatus } from '@/lib/types';
import { PlusCircle, Users, Globe, Wifi, Search as SearchIcon, UploadCloud } from 'lucide-react';
import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from '@/components/ui/input';
import { getPersonas, deletePersona, createPersona, testPersona, updatePersona } from '@/lib/services/personaService'; // Updated import
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';

// Zod schemas for validating imported persona structures (remains the same)
const HttpPersonaImportSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  personaType: z.literal('http').optional(),
  userAgent: z.string().optional(),
  headers: z.record(z.string()).optional(),
  headerOrder: z.array(z.string()).optional(),
  tlsClientHello: z.object({
    minVersion: z.string().optional(),
    maxVersion: z.string().optional(),
    cipherSuites: z.array(z.string()).optional(),
    curvePreferences: z.array(z.string()).optional(),
    ja3: z.string().optional(),
  }).optional().nullable(),
  http2Settings: z.record(z.any()).optional().nullable(), 
  cookieHandling: z.object({
    mode: z.string().optional(),
  }).optional().nullable(),
  allowInsecureTls: z.boolean().optional().default(false),
  requestTimeoutSec: z.number().int().positive().optional().default(30),
  maxRedirects: z.number().int().min(0).optional().default(5),
  notes: z.string().optional(),
});

const DnsPersonaConfigImportSchema = z.object({
  resolvers: z.array(z.string()).min(1),
  useSystemResolvers: z.boolean().optional(),
  queryTimeoutSeconds: z.number().int().positive(),
  maxDomainsPerRequest: z.number().int().positive().optional(),
  resolverStrategy: z.enum(["random_rotation", "weighted_rotation", "sequential_failover"]),
  resolversWeighted: z.record(z.number()).optional().nullable(),
  resolversPreferredOrder: z.array(z.string()).optional().nullable(),
  concurrentQueriesPerDomain: z.number().int().positive(),
  queryDelayMinMs: z.number().int().min(0).optional(),
  queryDelayMaxMs: z.number().int().min(0).optional(),
  maxConcurrentGoroutines: z.number().int().positive(),
  rateLimitDps: z.number().positive().optional(), // Changed to positive
  rateLimitBurst: z.number().int().positive().optional(),
});

const DnsPersonaImportSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  personaType: z.literal('dns').optional(),
  config: DnsPersonaConfigImportSchema,
});

// const PersonaImportSchema = z.union([HttpPersonaImportSchema, DnsPersonaImportSchema]);


function PersonasPageContent() {
  const [httpPersonas, setHttpPersonas] = useState<HttpPersona[]>([]);
  const [dnsPersonas, setDnsPersonas] = useState<DnsPersona[]>([]);
  const [loadingHttp, setLoadingHttp] = useState(true);
  const [loadingDns, setLoadingDns] = useState(true);
  const [activeTab, setActiveTab] = useState<'http' | 'dns'>('http');
  const [searchTermHttp, setSearchTermHttp] = useState("");
  const [searchTermDns, setSearchTermDns] = useState("");
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [actionLoading, setActionLoading] = useState<Record<string, 'test' | 'toggle' | 'delete' | null>>({});


  const fetchPersonasData = useCallback(async (type: 'http' | 'dns', showLoading = true) => {
    if (type === 'http') setLoadingHttp(showLoading);
    else setLoadingDns(showLoading);
    try {
      const response: PersonasListResponse = await getPersonas(type);
      if (response.status === 'success' && response.data) {
        if (type === 'http') setHttpPersonas(response.data as HttpPersona[]);
        else setDnsPersonas(response.data as DnsPersona[]);
      } else {
        toast({ title: `Error Loading ${type.toUpperCase()} Personas`, description: response.message || `Failed to load ${type.toUpperCase()} personas.`, variant: "destructive"});
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : `Failed to load ${type.toUpperCase()} personas.`;
      toast({ title: `Error Loading ${type.toUpperCase()} Personas`, description: errorMessage, variant: "destructive"});
    } finally {
      if (type === 'http') setLoadingHttp(false);
      else setLoadingDns(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchPersonasData(activeTab);
  }, [activeTab, fetchPersonasData]);

  const handleDeletePersona = async (personaId: string, personaType: 'http' | 'dns') => {
    setActionLoading(prev => ({ ...prev, [personaId]: 'delete' }));
    try {
      const response: PersonaDeleteResponse = await deletePersona(personaId, personaType);
      if (response.status === 'success') {
        toast({ title: "Persona Deleted", description: response.message || `Persona successfully deleted.` });
        fetchPersonasData(personaType, false); 
      } else {
        toast({ title: "Error Deleting Persona", description: response.message || "Failed to delete persona.", variant: "destructive"});
      }
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred while deleting persona.";
        toast({ title: "Error", description: errorMessage, variant: "destructive"});
    } finally {
       setActionLoading(prev => ({ ...prev, [personaId]: null }));
    }
  };

  const handleTestPersona = async (personaId: string, personaType: 'http' | 'dns') => {
    setActionLoading(prev => ({ ...prev, [personaId]: 'test' }));
    try {
      const response: PersonaActionResponse = await testPersona(personaId, personaType);
      if (response.status === 'success' && response.data?.persona) {
        toast({ title: "Persona Test Complete", description: `Test for ${response.data.persona.name} resulted in status: ${response.data.persona.status}.` });
        fetchPersonasData(personaType, false); 
      } else {
        toast({ title: "Persona Test Failed", description: response.message || "Could not complete persona test.", variant: "destructive"});
        fetchPersonasData(personaType, false); // Re-fetch even on failure to update potential status changes
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to test persona";
      toast({ title: "Error Testing Persona", description: errorMessage, variant: "destructive" });
      fetchPersonasData(personaType, false);
    } finally {
      setActionLoading(prev => ({ ...prev, [personaId]: null }));
    }
  };

  const handleTogglePersonaStatus = async (personaId: string, personaType: 'http' | 'dns', newStatus: PersonaStatus) => {
    setActionLoading(prev => ({ ...prev, [personaId]: 'toggle' }));
    try {
      const response = await updatePersona(personaId, { status: newStatus }, personaType);
      if (response.status === 'success' && response.data) {
        toast({ title: `Persona Status Updated`, description: `${response.data.name} is now ${newStatus}.` });
        fetchPersonasData(personaType, false);
      } else {
        toast({ title: "Error Updating Status", description: response.message || "Could not update persona status.", variant: "destructive"});
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to update persona status";
      toast({ title: "Error Updating Status", description: errorMessage, variant: "destructive" });
    } finally {
       setActionLoading(prev => ({ ...prev, [personaId]: null }));
    }
  };


  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const jsonData = JSON.parse(content);
        const itemsToImport = Array.isArray(jsonData) ? jsonData : [jsonData];
        let importedCount = 0;
        let errorCount = 0;

        for (const item of itemsToImport) {
            const personaTypeForImport = item.personaType || activeTab; 
            if (item.personaType && personaTypeForImport !== activeTab) {
                toast({ title: "Import Error", description: `Mismatched persona type in file for item: ${item.name || 'Unknown'}. Skipping. Active tab is ${activeTab}.`, variant: "destructive" });
                errorCount++;
                continue;
            }
            const itemWithExplicitType = { ...item, personaType: personaTypeForImport };
            const schema = personaTypeForImport === 'http' ? HttpPersonaImportSchema : DnsPersonaImportSchema;
            const validationResult = schema.safeParse(itemWithExplicitType);

            if (!validationResult.success) {
              console.error("Import validation error:", validationResult.error.flatten());
              toast({ title: "Import Validation Error", description: `Invalid structure for persona: ${item.name || 'Unknown'}. Check console. Skipping.`, variant: "destructive" });
              errorCount++;
              continue;
            }

            let createPayload: CreateHttpPersonaPayload | CreateDnsPersonaPayload;
            if (personaTypeForImport === 'http') {
                const validatedData = validationResult.data as z.infer<typeof HttpPersonaImportSchema>;
                createPayload = {
                    name: validatedData.name,
                    description: validatedData.description,
                    tags: validatedData.tags,
                    config: {
                        userAgent: validatedData.userAgent || "",
                        headers: validatedData.headers,
                        headerOrder: validatedData.headerOrder,
                        tlsClientHello: validatedData.tlsClientHello ?? undefined,
                        http2Settings: validatedData.http2Settings ?? undefined,
                        cookieHandling: validatedData.cookieHandling ?? undefined,
                        allowInsecureTls: validatedData.allowInsecureTls,
                        requestTimeoutSec: validatedData.requestTimeoutSec,
                        maxRedirects: validatedData.maxRedirects,
                        notes: validatedData.notes,
                    }
                };
            } else {
                const validatedData = validationResult.data as z.infer<typeof DnsPersonaImportSchema>;
                 createPayload = {
                    name: validatedData.name,
                    description: validatedData.description,
                    tags: validatedData.tags,
                    config: validatedData.config,
                };
            }
            const response = await createPersona(createPayload);
            if (response.status === 'success') {
              importedCount++;
            } else {
              errorCount++;
              toast({ title: `Error Importing ${item.name || 'Persona'}`, description: response.message || "Failed to import.", variant: "destructive" });
            }
        }
        if (importedCount > 0) {
            toast({ title: "Import Successful", description: `${importedCount} persona(s) imported successfully.` });
            fetchPersonasData(activeTab, false);
        }
        if (errorCount > 0 && importedCount === 0) {
             toast({ title: "Import Failed", description: `No personas were imported due to errors.`, variant: "destructive" });
        }
      } catch (error: unknown) {
        console.error("File import error:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        toast({ title: "Import Failed", description: "Could not parse JSON file or an error occurred: " + errorMessage, variant: "destructive" });
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsText(file);
  };

  const filterPersonas = (personas: Persona[], searchTerm: string): Persona[] => {
    if (!searchTerm.trim()) return personas;
    const lowerSearchTerm = searchTerm.toLowerCase();
    return personas.filter(p =>
      p.name.toLowerCase().includes(lowerSearchTerm) ||
      (p.description && p.description.toLowerCase().includes(lowerSearchTerm)) ||
      (p.tags && p.tags.some(tag => tag.toLowerCase().includes(lowerSearchTerm)))
    );
  };

  const filteredHttpPersonas = useMemo(() => filterPersonas(httpPersonas, searchTermHttp), [httpPersonas, searchTermHttp]);
  const filteredDnsPersonas = useMemo(() => filterPersonas(dnsPersonas, searchTermDns), [dnsPersonas, searchTermDns]);

  const renderPersonaList = (personas: Persona[], isLoading: boolean, type: 'http' | 'dns', searchTerm: string, setSearchTerm: (term: string) => void) => {
    return (
      <>
        <div className="my-4 relative">
          <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={`Search ${type.toUpperCase()} personas by name, description, or tag...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-md pl-10"
          />
        </div>
        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3 mt-2">
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="shadow-md">
                <CardHeader><Skeleton className="h-6 w-3/4 mb-2" /><Skeleton className="h-4 w-1/2" /></CardHeader>
                <CardContent className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-10 w-2/3" /></CardContent>
                <CardFooter><Skeleton className="h-4 w-1/4" /></CardFooter>
              </Card>
            ))}
          </div>
        ) : personas.length === 0 ? (
          <div className="text-center py-10 border-2 border-dashed rounded-lg mt-6">
            {type === 'http' ? <Globe className="mx-auto h-12 w-12 text-muted-foreground" /> : <Wifi className="mx-auto h-12 w-12 text-muted-foreground" />}
            <h3 className="mt-2 text-lg font-medium">
              {searchTerm ? `No ${type.toUpperCase()} personas found matching "${searchTerm}"` : `No ${type.toUpperCase()} personas found`}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {searchTerm ? "Try a different search term or " : ""}
              Get started by creating or importing your first {type.toUpperCase()} persona.
            </p>
            <div className="mt-6">
              <Button asChild><Link href={`/personas/new?type=${type}`}><PlusCircle className="mr-2 h-4 w-4" /> Create {type.toUpperCase()} Persona</Link></Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3 mt-2">
            {personas.map(persona => (
              <PersonaListItem
                key={persona.id}
                persona={persona}
                onDelete={handleDeletePersona}
                onTest={handleTestPersona}
                onToggleStatus={handleTogglePersonaStatus}
                isTesting={actionLoading[persona.id] === 'test'}
                isTogglingStatus={actionLoading[persona.id] === 'toggle'}
              />
            ))}
          </div>
        )}
      </>
    );
  };

  return (
    <>
      <PageHeader
        title="Synthetic Personas"
        description="Manage custom HTTP and DNS personas for advanced operations."
        icon={Users}
        actionButtons={
          <div className="flex gap-2">
            <input type="file" ref={fileInputRef} onChange={handleImportFile} accept=".json" style={{ display: 'none' }} />
            <Button onClick={() => fileInputRef.current?.click()} variant="outline">
                <UploadCloud className="mr-2 h-4 w-4" /> Import {activeTab.toUpperCase()} Persona(s)
            </Button>
            <Button asChild><Link href={`/personas/new?type=${activeTab}`}><PlusCircle className="mr-2 h-4 w-4" /> Create New {activeTab.toUpperCase()} Persona</Link></Button>
          </div>
        }
      />

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'http' | 'dns')} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="http"><Globe className="mr-2 h-4 w-4"/>HTTP Personas ({httpPersonas.length})</TabsTrigger>
          <TabsTrigger value="dns"><Wifi className="mr-2 h-4 w-4"/>DNS Personas ({dnsPersonas.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="http">
          {renderPersonaList(filteredHttpPersonas, loadingHttp, 'http', searchTermHttp, setSearchTermHttp)}
        </TabsContent>
        <TabsContent value="dns">
          {renderPersonaList(filteredDnsPersonas, loadingDns, 'dns', searchTermDns, setSearchTermDns)}
        </TabsContent>
      </Tabs>
    </>
  );
}
export default function PersonasPage() {
  return (
    <StrictProtectedRoute
      requiredPermissions={['personas:read']}
      redirectTo="/login"
    >
      <PersonasPageContent />
    </StrictProtectedRoute>
  );
}