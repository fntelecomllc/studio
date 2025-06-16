import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Campaign, HttpPersona, DnsPersona } from '@/lib/types';
import { getPersonas } from "@/lib/services/personaService";
import { getCampaigns } from "@/lib/services/campaignService.production";

interface CampaignFormData {
  httpPersonas: HttpPersona[];
  dnsPersonas: DnsPersona[];
  sourceCampaigns: Campaign[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Performance-optimized hook for loading campaign form data
 * Combines all async data loading with proper error handling and caching
 */
export function useCampaignFormData(_isEditing?: boolean): CampaignFormData {
  const [httpPersonas, setHttpPersonas] = useState<HttpPersona[]>([]);
  const [dnsPersonas, setDnsPersonas] = useState<DnsPersona[]>([]);
  const [sourceCampaigns, setSourceCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Memoize the data fetching function to prevent unnecessary re-creations
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Use Promise.allSettled to prevent one failed request from blocking others
      const [httpResult, dnsResult, campaignsResult] = await Promise.allSettled([
        getPersonas('http'),
        getPersonas('dns'),
        getCampaigns({ limit: 100, sortBy: 'created_at', sortOrder: 'desc' })
      ]);

      // Process HTTP personas result
      if (httpResult.status === 'fulfilled' && httpResult.value.status === 'success' && httpResult.value.data) {
        setHttpPersonas(httpResult.value.data as HttpPersona[]);
      } else {
        console.warn('[useCampaignFormData] Failed to load HTTP personas:', 
          httpResult.status === 'rejected' ? httpResult.reason : httpResult.value);
      }

      // Process DNS personas result
      if (dnsResult.status === 'fulfilled' && dnsResult.value.status === 'success' && dnsResult.value.data) {
        setDnsPersonas(dnsResult.value.data as DnsPersona[]);
      } else {
        console.warn('[useCampaignFormData] Failed to load DNS personas:', 
          dnsResult.status === 'rejected' ? dnsResult.reason : dnsResult.value);
      }

      // Process campaigns result
      if (campaignsResult.status === 'fulfilled' && campaignsResult.value.status === 'success' && campaignsResult.value.data) {
        // Filter campaigns that can be used as source (only domain_generation and dns_validation)
        const validSourceCampaigns = campaignsResult.value.data.filter(c =>
          c.selectedType === 'domain_generation' || c.selectedType === 'dns_validation'
        );
        setSourceCampaigns(validSourceCampaigns);
      } else {
        console.warn('[useCampaignFormData] Failed to load campaigns:', 
          campaignsResult.status === 'rejected' ? campaignsResult.reason : campaignsResult.value);
      }

      // Check if any critical failures occurred
      const failures = [httpResult, dnsResult, campaignsResult].filter(
        result => result.status === 'rejected'
      );

      if (failures.length === 3) {
        // All requests failed
        setError('Failed to load form data. Please check your connection and try again.');
      } else if (failures.length > 0) {
        // Some requests failed
        const failureMessages = failures.map(f => 
          f.status === 'rejected' ? f.reason?.message || 'Unknown error' : ''
        ).filter(Boolean);
        console.warn('[useCampaignFormData] Partial failures:', failureMessages);
        // Don't set error for partial failures - let the form work with what we have
      }

    } catch (error) {
      console.error('[useCampaignFormData] Unexpected error loading form data:', error);
      setError(error instanceof Error ? error.message : 'Failed to load form data');
    } finally {
      setIsLoading(false);
    }
  }, []); // Empty deps - this function doesn't depend on external values

  // Load data on mount, with dependency on isEditing to prevent unnecessary reloads
  useEffect(() => {
    fetchData();
  }, [fetchData]); // Only refetch if fetchData function changes (which it won't due to empty deps)

  // Memoize active personas for better performance in selects
  const activeHttpPersonas = useMemo(() => 
    httpPersonas.filter(p => p.status === 'Active'), 
    [httpPersonas]
  );

  const activeDnsPersonas = useMemo(() => 
    dnsPersonas.filter(p => p.status === 'Active'), 
    [dnsPersonas]
  );

  return {
    httpPersonas: activeHttpPersonas,
    dnsPersonas: activeDnsPersonas,
    sourceCampaigns,
    isLoading,
    error,
    refetch: fetchData
  };
}

/**
 * Hook for getting memoized persona selection options
 * Reduces re-renders when personas haven't changed
 */
export function usePersonaSelectionOptions(personas: HttpPersona[] | DnsPersona[]) {
  return useMemo(() => 
    personas.map(persona => ({
      id: persona.id,
      name: persona.name,
      status: persona.status
    })), 
    [personas]
  );
}

/**
 * Hook for getting memoized campaign selection options
 * Reduces re-renders when campaigns haven't changed
 */
export function useCampaignSelectionOptions(campaigns: Campaign[]) {
  return useMemo(() => 
    campaigns.map(campaign => ({
      id: campaign.id,
      name: campaign.campaignName || campaign.name,
      selectedType: campaign.selectedType
    })), 
    [campaigns]
  );
}