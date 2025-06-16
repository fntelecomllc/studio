"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { createPersona, updatePersona } from "@/lib/services/personaService";
import {
  Persona,
  HttpPersona,
  ApiErrorDetail,
  DnsPersona,
  DnsPersonaConfig,
  DnsResolverStrategy,
  CreateHttpPersonaPayload,
  CreateDnsPersonaPayload,
  UpdateHttpPersonaPayload,
  UpdateDnsPersonaPayload
} from "@/lib/types";

// DNS Resolver Strategy options
const DNS_RESOLVER_STRATEGIES: DnsResolverStrategy[] = [
  "random_rotation",
  "weighted_rotation",
  "sequential_failover"
];

// HTTP Persona Schema
const httpPersonaFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  tagsInput: z.string().optional(),
  userAgent: z.string().min(1, "User-Agent is required"),
  headersJson: z.string().min(1, "Headers JSON is required"),
  headerOrderInput: z.string().optional(),
  tlsClientHelloJson: z.string().optional(),
  http2SettingsJson: z.string().optional(),
  cookieHandlingJson: z.string().optional(),
  allowInsecureTls: z.boolean(),
  requestTimeoutSec: z.number().min(1),
  maxRedirects: z.number().min(0),
  notes: z.string().optional(),
});

// DNS Persona Schema
const dnsPersonaFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  tagsInput: z.string().optional(),
  config_resolversInput: z.string().min(1, "At least one resolver is required"),
  config_useSystemResolvers: z.boolean(),
  config_queryTimeoutSeconds: z.number().min(1),
  config_maxDomainsPerRequest: z.number().optional(),
  config_resolverStrategy: z.enum(DNS_RESOLVER_STRATEGIES as [DnsResolverStrategy, ...DnsResolverStrategy[]]),
  config_resolversWeightedJson: z.string().optional(),
  config_resolversPreferredOrderInput: z.string().optional(),
  config_concurrentQueriesPerDomain: z.number().min(1),
  config_queryDelayMinMs: z.number().optional(),
  config_queryDelayMaxMs: z.number().optional(),
  config_maxConcurrentGoroutines: z.number().min(1),
  config_rateLimitDps: z.number().optional(),
  config_rateLimitBurst: z.number().optional(),
});

type HttpPersonaFormValues = z.infer<typeof httpPersonaFormSchema>;
type DnsPersonaFormValues = z.infer<typeof dnsPersonaFormSchema>;

interface PersonaFormProps {
  persona?: Persona;
  isEditing?: boolean;
  personaType: 'http' | 'dns';
}

// Utility functions
function parseStringToArray(input: string | undefined): string[] {
  if (!input) return [];
  return input.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

function parseJsonOrUndefined<T>(jsonString: string | undefined): T | undefined {
  if (!jsonString || jsonString.trim() === "" || jsonString.trim() === "{}") {
    return undefined;
  }
  try {
    return JSON.parse(jsonString) as T;
  } catch {
    return undefined;
  }
}

// HTTP Persona Form Component
function HttpPersonaForm({ persona, isEditing = false }: { persona?: Persona; isEditing?: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();

  const stringifyJsonForForm = (obj: Record<string, unknown> | null | undefined) => obj ? JSON.stringify(obj, null, 2) : "{}";

  const form = useForm<HttpPersonaFormValues>({
    resolver: zodResolver(httpPersonaFormSchema),
    defaultValues: persona
      ? {
          name: persona.name,
          description: persona.description || "",
          tagsInput: (persona as HttpPersona).tags?.join(', ') || "",
          userAgent: (persona as HttpPersona).config.userAgent || "",
          headersJson: stringifyJsonForForm((persona as HttpPersona).config.headers),
          headerOrderInput: (persona as HttpPersona).config.headerOrder?.join(', ') || "",
          tlsClientHelloJson: stringifyJsonForForm((persona as HttpPersona).config.tlsClientHello),
          http2SettingsJson: stringifyJsonForForm((persona as HttpPersona).config.http2Settings),
          cookieHandlingJson: stringifyJsonForForm((persona as HttpPersona).config.cookieHandling),
          allowInsecureTls: (persona as HttpPersona).config.allowInsecureTls || false,
          requestTimeoutSec: (persona as HttpPersona).config.requestTimeoutSec || 30,
          maxRedirects: (persona as HttpPersona).config.maxRedirects || 5,
          notes: (persona as HttpPersona).config.notes || "",
        }
      : {
          name: "",
          description: "",
          tagsInput: "",
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
          headersJson: stringifyJsonForForm({ "Accept-Language": "en-US,en;q=0.9" }),
          headerOrderInput: "",
          tlsClientHelloJson: stringifyJsonForForm({ "cipherSuites": ["TLS_AES_128_GCM_SHA256", "TLS_CHACHA20_POLY1305_SHA256"] }),
          http2SettingsJson: stringifyJsonForForm({ "headerTableSize": 4096, "enablePush": false }),
          cookieHandlingJson: stringifyJsonForForm({ "mode": "session" }),
          allowInsecureTls: false,
          requestTimeoutSec: 30,
          maxRedirects: 5,
          notes: "",
        },
    mode: "onChange",
  });

  async function onSubmit(data: HttpPersonaFormValues) {
    if (!user) {
      toast({ title: "Authentication Required", description: "Please log in to create or edit personas.", variant: "destructive" });
      return;
    }

    const commonPayloadData = {
        name: data.name,
        description: data.description || undefined,
        tags: parseStringToArray(data.tagsInput || ""),
    };

    try {
      const payload: CreateHttpPersonaPayload | UpdateHttpPersonaPayload = {
          ...commonPayloadData,
          config: {
            userAgent: data.userAgent,
            headers: parseJsonOrUndefined<Record<string,string>>(data.headersJson || ""),
            headerOrder: parseStringToArray(data.headerOrderInput || ""),
            tlsClientHello: parseJsonOrUndefined(data.tlsClientHelloJson || ""),
            http2Settings: parseJsonOrUndefined(data.http2SettingsJson || ""),
            cookieHandling: parseJsonOrUndefined(data.cookieHandlingJson || ""),
            allowInsecureTls: data.allowInsecureTls,
            requestTimeoutSec: data.requestTimeoutSec,
            maxRedirects: data.maxRedirects,
            notes: data.notes || undefined,
          }
      };

      let response;
      if (isEditing && persona) {
        response = await updatePersona(persona.id, payload, 'http');
      } else {
        response = await createPersona(payload as CreateHttpPersonaPayload);
      }

      if (response.status === 'success') {
        toast({ title: `Persona ${isEditing ? "Updated" : "Created"}`, description: `Persona "${response.data?.name}" has been successfully ${isEditing ? "updated" : "created"}.` });
        router.push("/personas");
        router.refresh();
      } else {
        toast({ title: "Save Failed", description: response.message || "Could not save persona.", variant: "destructive" });
        if (response.errors) {
            response.errors.forEach((err: ApiErrorDetail) => {
                if (err.field) {
                    form.setError(err.field as keyof HttpPersonaFormValues, { type: "manual", message: err.message });
                } else {
                     toast({ title: "Operation Failed", description: err.message, variant: "destructive"})
                }
            });
        }
      }
    } catch (error: unknown) {
      console.error("Failed to save persona:", error);
      toast({ 
        title: "Save Failed", 
        description: error instanceof Error ? error.message : "An unexpected error occurred. Please try again.", 
        variant: "destructive" 
      });
    }
  }

  return (
    <Card className="max-w-3xl mx-auto shadow-xl">
      <CardHeader>
        <CardTitle>{isEditing ? "Edit" : "Create New"} HTTP Persona</CardTitle>
        <CardDescription>
          {isEditing ? "Update details for this HTTP persona." : "Define a new HTTP persona for network operations."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <FormField control={form.control} name="name" render={({ field }) => (<FormItem><FormLabel>Persona Name</FormLabel><FormControl><Input placeholder="e.g., Stealth Chrome US" {...field} /></FormControl><FormDescription>A unique and descriptive name for this persona.</FormDescription><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="description" render={({ field }) => (<FormItem><FormLabel>Description (Optional)</FormLabel><FormControl><Textarea placeholder="Describe the purpose or key characteristics of this persona." {...field} /></FormControl><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="userAgent" render={({ field }) => (<FormItem><FormLabel>User-Agent String</FormLabel><FormControl><Input placeholder="Mozilla/5.0 (Windows NT 10.0; Win64; x64)..." {...field} /></FormControl><FormDescription>The User-Agent string this persona will use.</FormDescription><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="headersJson" render={({ field }) => (<FormItem><FormLabel>HTTP Headers (JSON)</FormLabel><FormControl><Textarea placeholder='{ &quot;Accept-Language&quot;: &quot;en-US,en;q=0.9&quot;, &quot;X-Custom-Header&quot;: &quot;Value&quot; }' className="font-mono min-h-[120px]" {...field} /></FormControl><FormDescription>Enter custom HTTP headers as a JSON object string.</FormDescription><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="headerOrderInput" render={({ field }) => (<FormItem><FormLabel>Header Order (comma-separated, Optional)</FormLabel><FormControl><Input placeholder="user-agent,accept-language,accept-encoding" {...field} /></FormControl><FormDescription>Specify the order of headers if needed by the target.</FormDescription><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="tlsClientHelloJson" render={({ field }) => (<FormItem><FormLabel>TLS ClientHello Config (JSON, Optional)</FormLabel><FormControl><Textarea placeholder='{ &quot;minVersion&quot;: &quot;TLS12&quot;, &quot;cipherSuites&quot;: [...] }' className="font-mono min-h-[100px]" {...field} /></FormControl><FormDescription>Define TLS handshake parameters (e.g., JA3/JA4 related).</FormDescription><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="http2SettingsJson" render={({ field }) => (<FormItem><FormLabel>HTTP/2 Settings (JSON, Optional)</FormLabel><FormControl><Textarea placeholder='{ &quot;headerTableSize&quot;: 4096, &quot;enablePush&quot;: false }' className="font-mono min-h-[80px]" {...field} /></FormControl><FormDescription>Configure HTTP/2 protocol parameters.</FormDescription><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="cookieHandlingJson" render={({ field }) => (<FormItem><FormLabel>Cookie Handling Config (JSON, Optional)</FormLabel><FormControl><Textarea placeholder='{ &quot;mode&quot;: &quot;session&quot; }' className="font-mono min-h-[60px]" {...field} /></FormControl><FormDescription>Define how cookies are handled (e.g., &quot;none&quot;, &quot;session&quot;, &quot;file&quot;).</FormDescription><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="requestTimeoutSec" render={({ field }) => (<FormItem><FormLabel>Request Timeout (seconds)</FormLabel><FormControl><Input type="number" {...field} onChange={e => field.onChange(parseInt(e.target.value))} /></FormControl><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="maxRedirects" render={({ field }) => (<FormItem><FormLabel>Max Redirects</FormLabel><FormControl><Input type="number" {...field} onChange={e => field.onChange(parseInt(e.target.value))} /></FormControl><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="allowInsecureTls" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"><div className="space-y-0.5"><FormLabel>Allow Insecure TLS</FormLabel><FormDescription>Allow connections to servers with invalid/self-signed TLS certificates.</FormDescription></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="notes" render={({ field }) => (<FormItem><FormLabel>Notes (Optional)</FormLabel><FormControl><Textarea placeholder="Internal notes about this HTTP persona." {...field} /></FormControl><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="tagsInput" render={({ field }) => (<FormItem><FormLabel>Tags (comma-separated - Optional)</FormLabel><FormControl><Input placeholder="e.g., stealth, primary-dns, us-region-proxy" {...field} /></FormControl><FormDescription>Help organize and filter personas. Use for grouping or classification.</FormDescription><FormMessage /></FormItem>)} />

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => router.push("/personas")} disabled={form.formState.isSubmitting}>Cancel</Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {form.formState.isSubmitting ? (isEditing ? "Saving..." : "Creating...") : (isEditing ? "Save Changes" : "Create Persona")}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

// DNS Persona Form Component
function DnsPersonaForm({ persona, isEditing = false }: { persona?: Persona; isEditing?: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();

  const stringifyJsonObjectForForm = (obj: Record<string, number> | null | undefined) => obj ? JSON.stringify(obj, null, 2) : "{}";

  const form = useForm<DnsPersonaFormValues>({
    resolver: zodResolver(dnsPersonaFormSchema),
    defaultValues: persona
      ? {
          name: persona.name,
          description: persona.description || "",
          tagsInput: (persona as DnsPersona).tags?.join(', ') || "",
          config_resolversInput: (persona as DnsPersona).config.resolvers?.join(', ') || "",
          config_useSystemResolvers: (persona as DnsPersona).config.useSystemResolvers || false,
          config_queryTimeoutSeconds: (persona as DnsPersona).config.queryTimeoutSeconds || 5,
          config_maxDomainsPerRequest: (persona as DnsPersona).config.maxDomainsPerRequest,
          config_resolverStrategy: (persona as DnsPersona).config.resolverStrategy || "random_rotation",
          config_resolversWeightedJson: stringifyJsonObjectForForm((persona as DnsPersona).config.resolversWeighted || {}),
          config_resolversPreferredOrderInput: (persona as DnsPersona).config.resolversPreferredOrder?.join(', ') || "",
          config_concurrentQueriesPerDomain: (persona as DnsPersona).config.concurrentQueriesPerDomain || 2,
          config_queryDelayMinMs: (persona as DnsPersona).config.queryDelayMinMs,
          config_queryDelayMaxMs: (persona as DnsPersona).config.queryDelayMaxMs,
          config_maxConcurrentGoroutines: (persona as DnsPersona).config.maxConcurrentGoroutines || 10,
          config_rateLimitDps: (persona as DnsPersona).config.rateLimitDps,
          config_rateLimitBurst: (persona as DnsPersona).config.rateLimitBurst,
        }
      : {
          name: "",
          description: "",
          tagsInput: "",
          config_resolversInput: "8.8.8.8, 1.1.1.1",
          config_useSystemResolvers: false,
          config_queryTimeoutSeconds: 5,
          config_resolverStrategy: "random_rotation" as DnsResolverStrategy,
          config_resolversWeightedJson: "{}",
          config_resolversPreferredOrderInput: "",
          config_concurrentQueriesPerDomain: 2,
          config_maxConcurrentGoroutines: 10,
        },
    mode: "onChange",
  });

  async function onSubmit(data: DnsPersonaFormValues) {
    if (!user) {
      toast({ title: "Authentication Required", description: "Please log in to create or edit personas.", variant: "destructive" });
      return;
    }

    const commonPayloadData = {
        name: data.name,
        description: data.description || undefined,
        tags: parseStringToArray(data.tagsInput || ""),
    };

    try {
      const dnsConfig: DnsPersonaConfig = {
          resolvers: parseStringToArray(data.config_resolversInput || ""),
          useSystemResolvers: data.config_useSystemResolvers,
          queryTimeoutSeconds: data.config_queryTimeoutSeconds,
          maxDomainsPerRequest: data.config_maxDomainsPerRequest,
          resolverStrategy: data.config_resolverStrategy,
          resolversWeighted: parseJsonOrUndefined<Record<string, number>>(data.config_resolversWeightedJson || ""),
          resolversPreferredOrder: parseStringToArray(data.config_resolversPreferredOrderInput || ""),
          concurrentQueriesPerDomain: data.config_concurrentQueriesPerDomain,
          queryDelayMinMs: data.config_queryDelayMinMs,
          queryDelayMaxMs: data.config_queryDelayMaxMs,
          maxConcurrentGoroutines: data.config_maxConcurrentGoroutines,
          rateLimitDps: data.config_rateLimitDps,
          rateLimitBurst: data.config_rateLimitBurst,
      };

      const payload: CreateDnsPersonaPayload | UpdateDnsPersonaPayload = {
          ...commonPayloadData,
          config: dnsConfig,
      };

      let response;
      if (isEditing && persona) {
        response = await updatePersona(persona.id, payload, 'dns');
      } else {
        response = await createPersona(payload as CreateDnsPersonaPayload);
      }

      if (response.status === 'success') {
        toast({ title: `Persona ${isEditing ? "Updated" : "Created"}`, description: `Persona "${response.data?.name}" has been successfully ${isEditing ? "updated" : "created"}.` });
        router.push("/personas");
        router.refresh();
      } else {
        toast({ title: "Save Failed", description: response.message || "Could not save persona.", variant: "destructive" });
        if (response.errors) {
            response.errors.forEach((err: ApiErrorDetail) => {
                if (err.field) {
                    form.setError(err.field as keyof DnsPersonaFormValues, { type: "manual", message: err.message });
                } else {
                     toast({ title: "Operation Failed", description: err.message, variant: "destructive"})
                }
            });
        }
      }
    } catch (error: unknown) {
      console.error("Failed to save persona:", error);
      toast({ title: "Save Failed", description: (error as Error).message || "An unexpected error occurred. Please try again.", variant: "destructive" });
    }
  }

  return (
    <Card className="max-w-3xl mx-auto shadow-xl">
      <CardHeader>
        <CardTitle>{isEditing ? "Edit" : "Create New"} DNS Persona</CardTitle>
        <CardDescription>
          {isEditing ? "Update details for this DNS persona." : "Define a new DNS persona for network operations."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <FormField control={form.control} name="name" render={({ field }) => (<FormItem><FormLabel>Persona Name</FormLabel><FormControl><Input placeholder="e.g., Quad9 Secure DNS" {...field} /></FormControl><FormDescription>A unique and descriptive name for this persona.</FormDescription><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="description" render={({ field }) => (<FormItem><FormLabel>Description (Optional)</FormLabel><FormControl><Textarea placeholder="Describe the purpose or key characteristics of this persona." {...field} /></FormControl><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="config_resolverStrategy" render={({ field }) => ( <FormItem><FormLabel>Resolver Strategy</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select a strategy" /></SelectTrigger></FormControl><SelectContent>{DNS_RESOLVER_STRATEGIES.map(s => (<SelectItem key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="config_resolversInput" render={({ field }) => (<FormItem><FormLabel>Resolvers (comma-separated)</FormLabel><FormControl><Textarea placeholder="8.8.8.8, 1.1.1.1, https://dns.google/dns-query" {...field} /></FormControl><FormDescription>List of DNS resolver IP addresses or DoH/DoT URLs.</FormDescription><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="config_useSystemResolvers" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"><div className="space-y-0.5"><FormLabel>Use System Resolvers</FormLabel><FormDescription>Fallback to system&apos;s DNS if custom resolvers fail or are not set.</FormDescription></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="config_queryTimeoutSeconds" render={({ field }) => (<FormItem><FormLabel>Query Timeout (seconds)</FormLabel><FormControl><Input type="number" {...field} onChange={e => field.onChange(parseInt(e.target.value))} /></FormControl><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="config_maxDomainsPerRequest" render={({ field }) => (<FormItem><FormLabel>Max Domains Per Request (Optional)</FormLabel><FormControl><Input type="number" placeholder="e.g., 10 (for DoH batching)" {...field} onChange={e => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)} /></FormControl><FormDescription>Relevant for protocols like DoH that support batch queries.</FormDescription><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="config_resolversWeightedJson" render={({ field }) => (<FormItem><FormLabel>Weighted Resolvers (JSON Object - Optional)</FormLabel><FormControl><Textarea placeholder='{&quot;8.8.8.8&quot;: 10, &quot;1.1.1.1&quot;: 5}' className="font-mono min-h-[80px]" {...field} /></FormControl><FormDescription>For &apos;Weighted Rotation&apos; strategy. Object with resolver as key and weight as value.</FormDescription><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="config_resolversPreferredOrderInput" render={({ field }) => (<FormItem><FormLabel>Preferred Order (comma-separated - Optional)</FormLabel><FormControl><Textarea placeholder="1.1.1.1, 8.8.8.8" {...field} /></FormControl><FormDescription>For &apos;Sequential Failover&apos; strategy. Order of resolvers to try.</FormDescription><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="config_concurrentQueriesPerDomain" render={({ field }) => (<FormItem><FormLabel>Concurrent Queries Per Domain</FormLabel><FormControl><Input type="number" {...field} onChange={e => field.onChange(parseInt(e.target.value))} /></FormControl><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="config_queryDelayMinMs" render={({ field }) => (<FormItem><FormLabel>Query Delay Min (ms - Optional)</FormLabel><FormControl><Input type="number" placeholder="e.g., 0" {...field} onChange={e => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)} /></FormControl><FormDescription>Minimum random delay before a query.</FormDescription><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="config_queryDelayMaxMs" render={({ field }) => (<FormItem><FormLabel>Query Delay Max (ms - Optional)</FormLabel><FormControl><Input type="number" placeholder="e.g., 100" {...field} onChange={e => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)} /></FormControl><FormDescription>Maximum random delay before a query. Must be &gt;= Min Delay.</FormDescription><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="config_maxConcurrentGoroutines" render={({ field }) => (<FormItem><FormLabel>Max Concurrent Operations</FormLabel><FormControl><Input type="number" {...field} onChange={e => field.onChange(parseInt(e.target.value))} /></FormControl><FormDescription>Overall concurrency limit for DNS operations using this persona.</FormDescription><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="config_rateLimitDps" render={({ field }) => (<FormItem><FormLabel>Rate Limit (DPS - Optional)</FormLabel><FormControl><Input type="number" placeholder="e.g., 100 (Domains Per Second)" {...field} onChange={e => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)} /></FormControl><FormDescription>Max domains to process per second.</FormDescription><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="config_rateLimitBurst" render={({ field }) => (<FormItem><FormLabel>Rate Limit Burst (Optional)</FormLabel><FormControl><Input type="number" placeholder="e.g., 10" {...field} onChange={e => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)} /></FormControl><FormDescription>Allowed burst size for rate limiting.</FormDescription><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="tagsInput" render={({ field }) => (<FormItem><FormLabel>Tags (comma-separated - Optional)</FormLabel><FormControl><Input placeholder="e.g., stealth, primary-dns, us-region-proxy" {...field} /></FormControl><FormDescription>Help organize and filter personas. Use for grouping or classification.</FormDescription><FormMessage /></FormItem>)} />

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => router.push("/personas")} disabled={form.formState.isSubmitting}>Cancel</Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {form.formState.isSubmitting ? (isEditing ? "Saving..." : "Creating...") : (isEditing ? "Save Changes" : "Create Persona")}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

// Main component that renders the appropriate form
export default function PersonaForm({ persona, isEditing = false, personaType }: PersonaFormProps) {
  if (personaType === 'http') {
    return <HttpPersonaForm persona={persona} isEditing={isEditing} />;
  } else {
    return <DnsPersonaForm persona={persona} isEditing={isEditing} />;
  }
}
