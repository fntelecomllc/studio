// src/lib/services/personaService.ts
import apiClient from './apiClient.production';
import {
  validateDnsPersonaConfig as _validateDnsPersonaConfig,
  validateHttpPersonaConfig as _validateHttpPersonaConfig,
  serializePersonaConfig as _serializePersonaConfig,
  deserializePersonaConfig as _deserializePersonaConfig
} from '@/lib/utils/personaConfigValidation';
import type {
  HttpPersona,
  DnsPersona,
  CreateHttpPersonaPayload,
  CreateDnsPersonaPayload,
  UpdateHttpPersonaPayload,
  UpdateDnsPersonaPayload,
  PersonasListResponse,
  PersonaDetailResponse,
  PersonaCreationResponse,
  PersonaUpdateResponse,
  PersonaDeleteResponse,
  PersonaActionResponse,
  HttpPersonaConfig,
  DnsPersonaConfig
} from '@/lib/types';

// API Request Body Types
interface _HttpPersonaRequestBody {
  name: string;
  personaType: 'http';
  description?: string;
  configDetails: {
    userAgent?: string;
    headers?: Record<string, string>;
    headerOrder?: string[];
    tlsClientHello?: {
      minVersion?: string;
      maxVersion?: string;
      cipherSuites?: string[];
      curvePreferences?: string[];
      ja3?: string;
    } | null;
    http2Settings?: {
      enabled?: boolean;
    } | null;
    cookieHandling?: {
      mode?: string;
    } | null;
    allowInsecureTls?: boolean;
    requestTimeoutSec?: number;
    maxRedirects?: number;
    rateLimitDps?: number;
    rateLimitBurst?: number;
  };
  isEnabled: boolean;
}

interface _DnsPersonaRequestBody {
  name: string;
  personaType: 'dns';
  description?: string;
  configDetails: {
    resolvers: string[];
    useSystemResolvers?: boolean;
    queryTimeoutSeconds: number;
    maxDomainsPerRequest?: number;
    resolverStrategy: string;
    resolversWeighted?: Record<string, number> | null;
    resolversPreferredOrder?: string[] | null;
    concurrentQueriesPerDomain: number;
    queryDelayMinMs?: number;
    queryDelayMaxMs?: number;
    maxConcurrentGoroutines: number;
    rateLimitDps?: number;
    rateLimitBurst?: number;
  };
  isEnabled: boolean;
}

interface PersonaUpdateBody {
  name?: string;
  description?: string;
  isEnabled?: boolean;
  config?: Record<string, unknown>;
  [key: string]: unknown;
}

// HTTP Persona Management
export async function createHttpPersona(payload: CreateHttpPersonaPayload): Promise<PersonaCreationResponse> {
  const requestBody = {
    name: payload.name,
    personaType: 'http',
    description: payload.description,
    config: {
      userAgent: (payload.configDetails as HttpPersonaConfig).userAgent,
      headers: (payload.configDetails as HttpPersonaConfig).headers,
      headerOrder: (payload.configDetails as HttpPersonaConfig).headerOrder,
      tlsClientHello: (payload.configDetails as HttpPersonaConfig).tlsClientHello,
      http2Settings: (payload.configDetails as HttpPersonaConfig).http2Settings,
      cookieHandling: (payload.configDetails as HttpPersonaConfig).cookieHandling,
      allowInsecureTls: (payload.configDetails as HttpPersonaConfig).allowInsecureTls,
      requestTimeoutSec: (payload.configDetails as HttpPersonaConfig).requestTimeoutSec,
      maxRedirects: (payload.configDetails as HttpPersonaConfig).maxRedirects,
      rateLimitDps: (payload.configDetails as HttpPersonaConfig).rateLimitDps,
      rateLimitBurst: (payload.configDetails as HttpPersonaConfig).rateLimitBurst
    },
    isEnabled: payload.isEnabled ?? true
  };

  return apiClient.post<HttpPersona>('/api/v2/personas/http', requestBody);
}

export async function listHttpPersonas(filters?: { isEnabled?: boolean; limit?: number; offset?: number }): Promise<PersonasListResponse> {
  return apiClient.get<HttpPersona[]>('/api/v2/personas/http', { params: filters });
}

// NOTE: Backend does not have individual GET persona endpoints
// Individual personas should be retrieved from the list response
export async function getHttpPersonaById(personaId: string): Promise<PersonaDetailResponse> {
  // Fallback: get from list and filter by ID
  const response = await listHttpPersonas();
  if (!response.data) {
    throw new Error('Failed to retrieve HTTP personas');
  }
  const persona = response.data.find(p => p.id === personaId);
  if (!persona) {
    throw new Error(`HTTP Persona with ID ${personaId} not found`);
  }
  return { status: 'success', data: persona, message: 'HTTP persona retrieved successfully' };
}

export async function updateHttpPersona(personaId: string, payload: UpdateHttpPersonaPayload): Promise<PersonaUpdateResponse> {
  const updateBody: PersonaUpdateBody = {
    name: payload.name,
    description: payload.description,
    isEnabled: payload.status === 'Active'
  };

  if (payload.configDetails !== undefined) {
    updateBody.config = {
      userAgent: (payload.configDetails as HttpPersonaConfig).userAgent,
      headers: (payload.configDetails as HttpPersonaConfig).headers,
      headerOrder: (payload.configDetails as HttpPersonaConfig).headerOrder,
      tlsClientHello: (payload.configDetails as HttpPersonaConfig).tlsClientHello,
      http2Settings: (payload.configDetails as HttpPersonaConfig).http2Settings,
      cookieHandling: (payload.configDetails as HttpPersonaConfig).cookieHandling,
      allowInsecureTls: (payload.configDetails as HttpPersonaConfig).allowInsecureTls,
      requestTimeoutSec: (payload.configDetails as HttpPersonaConfig).requestTimeoutSec,
      maxRedirects: (payload.configDetails as HttpPersonaConfig).maxRedirects,
      rateLimitDps: (payload.configDetails as HttpPersonaConfig).rateLimitDps,
      rateLimitBurst: (payload.configDetails as HttpPersonaConfig).rateLimitBurst
    };
  }

  return apiClient.put<HttpPersona>(`/api/v2/personas/http/${personaId}`, updateBody);
}

export async function deleteHttpPersona(personaId: string): Promise<PersonaDeleteResponse> {
  return apiClient.delete<null>(`/api/v2/personas/http/${personaId}`);
}

// DNS Persona Management
export async function createDnsPersona(payload: CreateDnsPersonaPayload): Promise<PersonaCreationResponse> {
  const requestBody = {
    name: payload.name,
    personaType: 'dns',
    description: payload.description,
    configDetails: {
      resolvers: (payload.configDetails as DnsPersonaConfig).resolvers,
      useSystemResolvers: (payload.configDetails as DnsPersonaConfig).useSystemResolvers,
      queryTimeoutSeconds: (payload.configDetails as DnsPersonaConfig).queryTimeoutSeconds,
      maxDomainsPerRequest: (payload.configDetails as DnsPersonaConfig).maxDomainsPerRequest,
      resolverStrategy: (payload.configDetails as DnsPersonaConfig).resolverStrategy,
      resolversWeighted: (payload.configDetails as DnsPersonaConfig).resolversWeighted,
      resolversPreferredOrder: (payload.configDetails as DnsPersonaConfig).resolversPreferredOrder,
      concurrentQueriesPerDomain: (payload.configDetails as DnsPersonaConfig).concurrentQueriesPerDomain,
      queryDelayMinMs: (payload.configDetails as DnsPersonaConfig).queryDelayMinMs,
      queryDelayMaxMs: (payload.configDetails as DnsPersonaConfig).queryDelayMaxMs,
      maxConcurrentGoroutines: (payload.configDetails as DnsPersonaConfig).maxConcurrentGoroutines,
      rateLimitDps: (payload.configDetails as DnsPersonaConfig).rateLimitDps,
      rateLimitBurst: (payload.configDetails as DnsPersonaConfig).rateLimitBurst
    },
    isEnabled: true
  };

  return apiClient.post<DnsPersona>('/api/v2/personas/dns', requestBody);
}

export async function listDnsPersonas(filters?: { isEnabled?: boolean; limit?: number; offset?: number }): Promise<PersonasListResponse> {
  return apiClient.get<DnsPersona[]>('/api/v2/personas/dns', { params: filters });
}

// NOTE: Backend does not have individual GET persona endpoints
// Individual personas should be retrieved from the list response
export async function getDnsPersonaById(personaId: string): Promise<PersonaDetailResponse> {
  // Fallback: get from list and filter by ID
  const response = await listDnsPersonas();
  if (!response.data) {
    throw new Error('Failed to retrieve DNS personas');
  }
  const persona = response.data.find(p => p.id === personaId);
  if (!persona) {
    throw new Error(`DNS Persona with ID ${personaId} not found`);
  }
  return { status: 'success', data: persona, message: 'DNS persona retrieved successfully' };
}

export async function updateDnsPersona(personaId: string, payload: UpdateDnsPersonaPayload): Promise<PersonaUpdateResponse> {
  const updateBody: PersonaUpdateBody = {
    name: payload.name,
    description: payload.description,
    isEnabled: payload.status === 'Active'
  };

  if (payload.configDetails) {
    updateBody.configDetails = {
      resolvers: (payload.configDetails as DnsPersonaConfig).resolvers,
      useSystemResolvers: (payload.configDetails as DnsPersonaConfig).useSystemResolvers,
      queryTimeoutSeconds: (payload.configDetails as DnsPersonaConfig).queryTimeoutSeconds,
      maxDomainsPerRequest: (payload.configDetails as DnsPersonaConfig).maxDomainsPerRequest,
      resolverStrategy: (payload.configDetails as DnsPersonaConfig).resolverStrategy,
      resolversWeighted: (payload.configDetails as DnsPersonaConfig).resolversWeighted,
      resolversPreferredOrder: (payload.configDetails as DnsPersonaConfig).resolversPreferredOrder,
      concurrentQueriesPerDomain: (payload.configDetails as DnsPersonaConfig).concurrentQueriesPerDomain,
      queryDelayMinMs: (payload.configDetails as DnsPersonaConfig).queryDelayMinMs,
      queryDelayMaxMs: (payload.configDetails as DnsPersonaConfig).queryDelayMaxMs,
      maxConcurrentGoroutines: (payload.configDetails as DnsPersonaConfig).maxConcurrentGoroutines,
      rateLimitDps: (payload.configDetails as DnsPersonaConfig).rateLimitDps,
      rateLimitBurst: (payload.configDetails as DnsPersonaConfig).rateLimitBurst
    };
  }

  return apiClient.put<DnsPersona>(`/api/v2/personas/dns/${personaId}`, updateBody);
}

export async function deleteDnsPersona(personaId: string): Promise<PersonaDeleteResponse> {
  return apiClient.delete<null>(`/api/v2/personas/dns/${personaId}`);
}

// Generic Persona Functions
export async function getPersonas(type: 'http' | 'dns', filters?: { isEnabled?: boolean; limit?: number; offset?: number }): Promise<PersonasListResponse> {
  if (type === 'http') {
    return listHttpPersonas(filters);
  } else {
    return listDnsPersonas(filters);
  }
}

export async function getPersonaById(personaId: string, type: 'http' | 'dns'): Promise<PersonaDetailResponse> {
  if (type === 'http') {
    return getHttpPersonaById(personaId);
  } else {
    return getDnsPersonaById(personaId);
  }
}

export async function createPersona(payload: CreateHttpPersonaPayload | CreateDnsPersonaPayload): Promise<PersonaCreationResponse> {
  if ('userAgent' in payload || payload.personaType === 'http') {
    return createHttpPersona(payload as CreateHttpPersonaPayload);
  } else {
    return createDnsPersona(payload as CreateDnsPersonaPayload);
  }
}

export async function updatePersona(
  personaId: string, 
  payload: UpdateHttpPersonaPayload | UpdateDnsPersonaPayload,
  type: 'http' | 'dns'
): Promise<PersonaUpdateResponse> {
  if (type === 'http') {
    return updateHttpPersona(personaId, payload as UpdateHttpPersonaPayload);
  } else {
    return updateDnsPersona(personaId, payload as UpdateDnsPersonaPayload);
  }
}

export async function deletePersona(personaId: string, type: 'http' | 'dns'): Promise<PersonaDeleteResponse> {
  if (type === 'http') {
    return deleteHttpPersona(personaId);
  } else {
    return deleteDnsPersona(personaId);
  }
}

// Persona Testing and Actions
// NOTE: Backend does not have persona test endpoints
export async function testPersona(personaId: string, type: 'http' | 'dns'): Promise<PersonaActionResponse> {
  console.warn(`Persona testing not available - backend does not have /api/v2/personas/${type}/${personaId}/test endpoint`);
  return {
    status: 'error',
    message: 'Persona testing is not implemented in the backend'
  };
}