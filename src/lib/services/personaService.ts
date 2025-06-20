// src/lib/services/personaService.ts
import apiClient from './apiClient.production';
import { TypeTransformer } from '@/lib/types/transform';
import {
  validateDnsPersonaConfig as _validateDnsPersonaConfig,
  validateHttpPersonaConfig as _validateHttpPersonaConfig,
  serializePersonaConfig as _serializePersonaConfig,
  deserializePersonaConfig as _deserializePersonaConfig
} from '@/lib/utils/personaConfigValidation';
import type {
  HttpPersona,
  DnsPersona,
  Persona,
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

// Helper functions for type-safe persona transformations
const transformPersona = (rawData: Record<string, unknown>): Persona => {
  const transformed = TypeTransformer.transformToPersona(rawData);
  return transformed as unknown as Persona;
};

const transformPersonaArray = (rawArray: Record<string, unknown>[]): Persona[] => {
  return rawArray.map(transformPersona);
};

// HTTP Persona Management
export async function createHttpPersona(payload: CreateHttpPersonaPayload): Promise<PersonaCreationResponse> {
  const requestBody = {
    name: payload.name,
    personaType: 'http',
    description: payload.description,
    configDetails: payload.configDetails,
    isEnabled: payload.isEnabled ?? true
  };

  const response = await apiClient.post<HttpPersona>('/api/v2/personas', requestBody);
  if (response.data) {
    response.data = transformPersona(response.data as unknown as Record<string, unknown>) as HttpPersona;
  }
  return response;
}

export async function listHttpPersonas(filters?: { isEnabled?: boolean; limit?: number; offset?: number }): Promise<PersonasListResponse> {
  const params = {
    ...filters,
    personaType: 'http'
  };
  const response = await apiClient.get<HttpPersona[]>('/api/v2/personas', { params });
  if (response.data && Array.isArray(response.data)) {
    response.data = transformPersonaArray(response.data as unknown as Record<string, unknown>[]) as HttpPersona[];
  }
  return response;
}

export async function getHttpPersonaById(personaId: string): Promise<PersonaDetailResponse> {
  const response = await apiClient.get<HttpPersona>(`/api/v2/personas/${personaId}`);
  if (response.data) {
    response.data = transformPersona(response.data as unknown as Record<string, unknown>) as HttpPersona;
  }
  return response;
}

export async function updateHttpPersona(personaId: string, payload: UpdateHttpPersonaPayload): Promise<PersonaUpdateResponse> {
  const updateBody = {
    name: payload.name,
    description: payload.description,
    isEnabled: payload.status === 'Active',
    configDetails: payload.configDetails
  };

  // Remove undefined fields
  Object.keys(updateBody).forEach(key => {
    if (updateBody[key as keyof typeof updateBody] === undefined) {
      delete updateBody[key as keyof typeof updateBody];
    }
  });

  const response = await apiClient.put<HttpPersona>(`/api/v2/personas/${personaId}`, updateBody);
  if (response.data) {
    response.data = transformPersona(response.data as unknown as Record<string, unknown>) as HttpPersona;
  }
  return response;
}

export async function deleteHttpPersona(personaId: string): Promise<PersonaDeleteResponse> {
  return apiClient.delete<null>(`/api/v2/personas/${personaId}`);
}

// DNS Persona Management
export async function createDnsPersona(payload: CreateDnsPersonaPayload): Promise<PersonaCreationResponse> {
  const requestBody = {
    name: payload.name,
    personaType: 'dns',
    description: payload.description,
    configDetails: payload.configDetails,
    isEnabled: payload.isEnabled ?? true
  };

  const response = await apiClient.post<DnsPersona>('/api/v2/personas', requestBody);
  if (response.data) {
    response.data = transformPersona(response.data as unknown as Record<string, unknown>) as DnsPersona;
  }
  return response;
}

export async function listDnsPersonas(filters?: { isEnabled?: boolean; limit?: number; offset?: number }): Promise<PersonasListResponse> {
  const params = {
    ...filters,
    personaType: 'dns'
  };
  const response = await apiClient.get<DnsPersona[]>('/api/v2/personas', { params });
  if (response.data && Array.isArray(response.data)) {
    response.data = transformPersonaArray(response.data as unknown as Record<string, unknown>[]) as DnsPersona[];
  }
  return response;
}

export async function getDnsPersonaById(personaId: string): Promise<PersonaDetailResponse> {
  const response = await apiClient.get<DnsPersona>(`/api/v2/personas/${personaId}`);
  if (response.data) {
    response.data = transformPersona(response.data as unknown as Record<string, unknown>) as DnsPersona;
  }
  return response;
}

export async function updateDnsPersona(personaId: string, payload: UpdateDnsPersonaPayload): Promise<PersonaUpdateResponse> {
  const updateBody = {
    name: payload.name,
    description: payload.description,
    isEnabled: payload.status === 'Active',
    configDetails: payload.configDetails
  };

  // Remove undefined fields
  Object.keys(updateBody).forEach(key => {
    if (updateBody[key as keyof typeof updateBody] === undefined) {
      delete updateBody[key as keyof typeof updateBody];
    }
  });

  const response = await apiClient.put<DnsPersona>(`/api/v2/personas/${personaId}`, updateBody);
  if (response.data) {
    response.data = transformPersona(response.data as unknown as Record<string, unknown>) as DnsPersona;
  }
  return response;
}

export async function deleteDnsPersona(personaId: string): Promise<PersonaDeleteResponse> {
  return apiClient.delete<null>(`/api/v2/personas/${personaId}`);
}

// Generic Persona Functions
export async function getPersonas(type: 'http' | 'dns', filters?: { isEnabled?: boolean; limit?: number; offset?: number }): Promise<PersonasListResponse> {
  if (type === 'http') {
    return listHttpPersonas(filters);
  } else {
    return listDnsPersonas(filters);
  }
}

export async function listAllPersonas(filters?: { isEnabled?: boolean; limit?: number; offset?: number }): Promise<PersonasListResponse> {
  const response = await apiClient.get<Persona[]>('/api/v2/personas', { params: filters });
  if (response.data && Array.isArray(response.data)) {
    response.data = transformPersonaArray(response.data as unknown as Record<string, unknown>[]);
  }
  return response;
}

export async function getPersonaById(personaId: string, type?: 'http' | 'dns'): Promise<PersonaDetailResponse> {
  const response = await apiClient.get<Persona>(`/api/v2/personas/${personaId}`);
  if (response.data) {
    response.data = transformPersona(response.data as unknown as Record<string, unknown>);
  }
  return response;
}

export async function createPersona(payload: CreateHttpPersonaPayload | CreateDnsPersonaPayload): Promise<PersonaCreationResponse> {
  const isHttpPayload = 'personaType' in payload && payload.personaType === 'http';
  if (isHttpPayload) {
    return createHttpPersona(payload as CreateHttpPersonaPayload);
  } else {
    return createDnsPersona(payload as CreateDnsPersonaPayload);
  }
}

export async function updatePersona(
  personaId: string, 
  payload: UpdateHttpPersonaPayload | UpdateDnsPersonaPayload,
  type?: 'http' | 'dns'
): Promise<PersonaUpdateResponse> {
  const updateBody = {
    name: payload.name,
    description: payload.description,
    isEnabled: payload.status === 'Active',
    configDetails: payload.configDetails
  };

  // Remove undefined fields
  Object.keys(updateBody).forEach(key => {
    if (updateBody[key as keyof typeof updateBody] === undefined) {
      delete updateBody[key as keyof typeof updateBody];
    }
  });

  const response = await apiClient.put<Persona>(`/api/v2/personas/${personaId}`, updateBody);
  if (response.data) {
    response.data = transformPersona(response.data as unknown as Record<string, unknown>);
  }
  return response;
}

export async function deletePersona(personaId: string, type?: 'http' | 'dns'): Promise<PersonaDeleteResponse> {
  return apiClient.delete<null>(`/api/v2/personas/${personaId}`);
}

// Persona Testing and Actions
export async function testPersona(personaId: string, type?: 'http' | 'dns'): Promise<PersonaActionResponse> {
  const response = await apiClient.post<any>(`/api/v2/personas/${personaId}/test`, {});
  return response;
}