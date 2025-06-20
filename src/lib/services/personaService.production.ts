// src/lib/services/personaService.production.ts
// CRITICAL SECURITY FIX: Type-safe persona service with configuration validation
// Updated to use unified persona API endpoints

import { apiClient } from './apiClient.production';
import { 
  validateDnsPersonaConfig, 
  validateHttpPersonaConfig, 
  deserializePersonaConfig 
} from '@/lib/utils/personaConfigValidation';
import type {
  HttpPersona,
  DnsPersona,
  Persona,
  CreateHttpPersonaPayload,
  CreateDnsPersonaPayload,
  UpdateHttpPersonaPayload,
  UpdateDnsPersonaPayload,
  PersonasListResponse as _PersonasListResponse,
  PersonaDetailResponse as _PersonaDetailResponse,
  PersonaCreationResponse as _PersonaCreationResponse,
  PersonaUpdateResponse as _PersonaUpdateResponse,
  PersonaDeleteResponse as _PersonaDeleteResponse,
  PersonaActionResponse,
  HttpPersonaConfig,
  DnsPersonaConfig
} from '@/lib/types';

// Backend API request structures that match Go models
interface BackendPersonaRequest {
  name: string;
  personaType: 'http' | 'dns';
  description?: string;
  configDetails: Record<string, unknown>; // JSON that will be validated
  isEnabled: boolean;
  [key: string]: unknown; // Index signature for compatibility
}

interface BackendPersonaResponse {
  id: string;
  name: string;
  personaType: 'http' | 'dns';
  description?: string;
  configDetails: Record<string, unknown> | string; // Could be JSON string or object
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Safely transforms backend persona response to frontend types with validation
 */
function transformBackendPersona(backendPersona: BackendPersonaResponse): Persona {
  try {
    // Deserialize and validate the configuration
    const config = deserializePersonaConfig(
      backendPersona.configDetails, 
      backendPersona.personaType
    );

    const basePersona = {
      id: backendPersona.id,
      name: backendPersona.name,
      description: backendPersona.description,
      isEnabled: backendPersona.isEnabled,
      status: 'Active' as const, // Default status
      createdAt: backendPersona.createdAt,
      updatedAt: backendPersona.updatedAt,
    };

    if (backendPersona.personaType === 'dns') {
      return {
        ...basePersona,
        personaType: 'dns',
        configDetails: config as DnsPersonaConfig,
      } as DnsPersona;
    } else {
      return {
        ...basePersona,
        personaType: 'http',
        configDetails: config as HttpPersonaConfig,
      } as HttpPersona;
    }
  } catch (error) {
    console.error('Failed to transform backend persona:', error);
    throw new Error(`Invalid persona configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// === HTTP PERSONA OPERATIONS ===

export async function createHttpPersona(payload: CreateHttpPersonaPayload): Promise<HttpPersona> {
  try {
    // CRITICAL SECURITY FIX: Validate configuration before sending to backend
    const validatedConfig = validateHttpPersonaConfig(payload.configDetails);
    
    const requestBody: BackendPersonaRequest = {
      name: payload.name,
      personaType: 'http',
      description: payload.description,
      configDetails: validatedConfig as unknown as Record<string, unknown>,
      isEnabled: payload.isEnabled ?? true
    };

    const response = await apiClient.post<BackendPersonaResponse>('/api/v2/personas', requestBody);
    if (!response.data) {
      throw new Error('No response data received');
    }
    return transformBackendPersona(response.data) as HttpPersona;
  } catch (error) {
    console.error('Failed to create HTTP persona:', error);
    throw error;
  }
}

export async function updateHttpPersona(
  personaId: string, 
  payload: UpdateHttpPersonaPayload
): Promise<HttpPersona> {
  try {
    const requestBody: Partial<BackendPersonaRequest> = {
      name: payload.name,
      description: payload.description,
      isEnabled: payload.isEnabled,
    };

    // Validate config if provided
    if (payload.configDetails) {
      requestBody.configDetails = validateHttpPersonaConfig(payload.configDetails) as unknown as Record<string, unknown>;
    }

    const response = await apiClient.put<BackendPersonaResponse>(`/api/v2/personas/${personaId}`, requestBody);
    if (!response.data) {
      throw new Error('No response data received');
    }
    return transformBackendPersona(response.data) as HttpPersona;
  } catch (error) {
    console.error('Failed to update HTTP persona:', error);
    throw error;
  }
}

// === DNS PERSONA OPERATIONS ===

export async function createDnsPersona(payload: CreateDnsPersonaPayload): Promise<DnsPersona> {
  try {
    // CRITICAL SECURITY FIX: Validate configuration before sending to backend
    const validatedConfig = validateDnsPersonaConfig(payload.configDetails);
    
    const requestBody: BackendPersonaRequest = {
      name: payload.name,
      personaType: 'dns',
      description: payload.description,
      configDetails: validatedConfig as unknown as Record<string, unknown>,
      isEnabled: payload.isEnabled ?? true
    };

    const response = await apiClient.post<BackendPersonaResponse>('/api/v2/personas', requestBody);
    if (!response.data) {
      throw new Error('No response data received');
    }
    return transformBackendPersona(response.data) as DnsPersona;
  } catch (error) {
    console.error('Failed to create DNS persona:', error);
    throw error;
  }
}

export async function updateDnsPersona(
  personaId: string, 
  payload: UpdateDnsPersonaPayload
): Promise<DnsPersona> {
  try {
    const requestBody: Partial<BackendPersonaRequest> = {
      name: payload.name,
      description: payload.description,
      isEnabled: payload.isEnabled,
    };

    // Validate config if provided
    if (payload.configDetails) {
      requestBody.configDetails = validateDnsPersonaConfig(payload.configDetails) as unknown as Record<string, unknown>;
    }

    const response = await apiClient.put<BackendPersonaResponse>(`/api/v2/personas/${personaId}`, requestBody);
    if (!response.data) {
      throw new Error('No response data received');
    }
    return transformBackendPersona(response.data) as DnsPersona;
  } catch (error) {
    console.error('Failed to update DNS persona:', error);
    throw error;
  }
}

// === GENERAL PERSONA OPERATIONS ===

export async function getPersonas(filters?: { 
  personaType?: 'http' | 'dns'; 
  isEnabled?: boolean; 
  limit?: number; 
  offset?: number; 
}): Promise<Persona[]> {
  try {
    const response = await apiClient.get<BackendPersonaResponse[]>('/api/v2/personas', {
      params: filters
    });
    
    if (!Array.isArray(response.data)) {
      throw new Error('Invalid response format: expected array');
    }

    return response.data.map(transformBackendPersona);
  } catch (error) {
    console.error('Failed to get personas:', error);
    throw error;
  }
}

export async function getPersonaById(personaId: string): Promise<Persona> {
  try {
    const response = await apiClient.get<BackendPersonaResponse>(`/api/v2/personas/${personaId}`);
    if (!response.data) {
      throw new Error('No response data received');
    }
    return transformBackendPersona(response.data);
  } catch (error) {
    console.error('Failed to get persona:', error);
    throw error;
  }
}

export async function deletePersona(personaId: string): Promise<void> {
  try {
    await apiClient.delete(`/api/v2/personas/${personaId}`);
  } catch (error) {
    console.error('Failed to delete persona:', error);
    throw error;
  }
}

export async function testPersona(personaId: string): Promise<PersonaActionResponse> {
  try {
    const response = await apiClient.post<PersonaActionResponse>(`/api/v2/personas/${personaId}/test`);
    if (!response.data) {
      throw new Error('No response data received');
    }
    return response.data;
  } catch (error) {
    console.error('Failed to test persona:', error);
    throw error;
  }
}

// === LEGACY COMPATIBILITY FUNCTIONS ===

export async function listHttpPersonas(filters?: { isEnabled?: boolean; limit?: number; offset?: number }): Promise<HttpPersona[]> {
  const personas = await getPersonas({ ...filters, personaType: 'http' });
  return personas.filter((p): p is HttpPersona => p.personaType === 'http');
}

export async function listDnsPersonas(filters?: { isEnabled?: boolean; limit?: number; offset?: number }): Promise<DnsPersona[]> {
  const personas = await getPersonas({ ...filters, personaType: 'dns' });
  return personas.filter((p): p is DnsPersona => p.personaType === 'dns');
}

export async function getHttpPersonaById(personaId: string): Promise<HttpPersona> {
  const persona = await getPersonaById(personaId);
  if (persona.personaType !== 'http') {
    throw new Error('Persona is not an HTTP persona');
  }
  return persona as HttpPersona;
}

export async function getDnsPersonaById(personaId: string): Promise<DnsPersona> {
  const persona = await getPersonaById(personaId);
  if (persona.personaType !== 'dns') {
    throw new Error('Persona is not a DNS persona');
  }
  return persona as DnsPersona;
}

export async function deleteHttpPersona(personaId: string): Promise<void> {
  return deletePersona(personaId);
}

export async function deleteDnsPersona(personaId: string): Promise<void> {
  return deletePersona(personaId);
}

// Default export for easier importing
const personaServiceExports = {
  // HTTP operations
  createHttpPersona,
  updateHttpPersona,
  listHttpPersonas,
  getHttpPersonaById,
  deleteHttpPersona,
  
  // DNS operations
  createDnsPersona,
  updateDnsPersona,
  listDnsPersonas,
  getDnsPersonaById,
  deleteDnsPersona,
  
  // General operations
  getPersonas,
  getPersonaById,
  deletePersona,
  testPersona,
};

export default personaServiceExports;
