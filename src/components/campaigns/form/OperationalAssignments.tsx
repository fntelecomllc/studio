import React, { memo } from 'react';
import { Control, Controller } from 'react-hook-form';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Globe, Wifi, ShieldCheck } from 'lucide-react';
import { CampaignFormValues, CampaignFormConstants } from "@/lib/schemas/campaignFormSchema";
import type { HttpPersona, DnsPersona } from '@/lib/types';

interface OperationalAssignmentsProps {
  control: Control<CampaignFormValues>;
  needsHttp: boolean;
  needsDns: boolean;
  httpPersonas: HttpPersona[];
  dnsPersonas: DnsPersona[];
  isLoading: boolean;
}

/**
 * Memoized operational assignments component
 * Handles persona and proxy assignments with optimized persona filtering
 */
const OperationalAssignments = memo<OperationalAssignmentsProps>(({
  control,
  needsHttp,
  needsDns,
  httpPersonas,
  dnsPersonas,
  isLoading
}) => {
  return (
    <Card className="p-4 pt-2 border-dashed">
      <CardHeader className="p-2">
        <CardTitle className="text-base">Operational Assignments</CardTitle>
      </CardHeader>
      <CardContent className="p-2 space-y-4">
        {needsHttp && (
          <Controller name="assignedHttpPersonaId" control={control} render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-1">
                <Globe className="h-4 w-4"/>HTTP Persona
              </FormLabel>
              <Select 
                onValueChange={(val) => field.onChange(val === CampaignFormConstants.NONE_VALUE_PLACEHOLDER ? undefined : val)} 
                value={field.value || CampaignFormConstants.NONE_VALUE_PLACEHOLDER} 
                disabled={isLoading}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={isLoading ? "Loading..." : "Select HTTP Persona"} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={CampaignFormConstants.NONE_VALUE_PLACEHOLDER}>None (Default)</SelectItem>
                  {httpPersonas.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                  {httpPersonas.length === 0 && (
                    <SelectItem value="no-active-http-for-form" disabled>No active HTTP personas.</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
        )}
        
        {needsDns && (
          <Controller name="assignedDnsPersonaId" control={control} render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-1">
                <Wifi className="h-4 w-4"/>DNS Persona
              </FormLabel>
              <Select 
                onValueChange={(val) => field.onChange(val === CampaignFormConstants.NONE_VALUE_PLACEHOLDER ? undefined : val)} 
                value={field.value || CampaignFormConstants.NONE_VALUE_PLACEHOLDER} 
                disabled={isLoading}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={isLoading ? "Loading..." : "Select DNS Persona"} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={CampaignFormConstants.NONE_VALUE_PLACEHOLDER}>None (Default)</SelectItem>
                  {dnsPersonas.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                  {dnsPersonas.length === 0 && (
                    <SelectItem value="no-active-dns-for-form" disabled>No active DNS personas.</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
        )}
        
        <Controller name="proxyAssignmentMode" control={control} render={({ field }) => (
          <FormItem>
            <FormLabel className="flex items-center gap-1">
              <ShieldCheck className="h-4 w-4" />Proxy Assignment
            </FormLabel>
            <Select onValueChange={field.onChange} value={field.value || 'none'} disabled={isLoading}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select proxy mode" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="none">None (Direct)</SelectItem>
                <SelectItem value="single">Single Proxy</SelectItem>
                <SelectItem value="rotate_active">Rotate Active Proxies</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )} />
      </CardContent>
    </Card>
  );
});

OperationalAssignments.displayName = 'OperationalAssignments';

export default OperationalAssignments;