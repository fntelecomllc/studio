// CRITICAL SECURITY FIX: Type-safe persona configuration validation
// Addresses audit issue: "Persona Configuration Type Safety"

import { z } from 'zod';
import type { DnsPersonaConfig, HttpPersonaConfig } from '@/lib/types';
import { logger } from '@/lib/utils/logger';

// Validation schemas that match backend DNSConfigDetails and HTTPConfigDetails
export const dnsPersonaConfigSchema = z.object({
  resolvers: z.array(z.string().min(1)).min(1),
  useSystemResolvers: z.boolean().default(false),
  queryTimeoutSeconds: z.number().min(0),
  maxDomainsPerRequest: z.number().min(1).default(100),
  resolverStrategy: z.enum(['random_rotation', 'weighted_rotation', 'sequential_failover']),
  resolversWeighted: z.record(z.string(), z.number()).optional(),
  resolversPreferredOrder: z.array(z.string()).optional(),
  concurrentQueriesPerDomain: z.number().min(1),
  queryDelayMinMs: z.number().min(0).default(0),
  queryDelayMaxMs: z.number().min(0).default(1000),
  maxConcurrentGoroutines: z.number().min(1),
  rateLimitDps: z.number().min(0).default(10),
  rateLimitBurst: z.number().min(0).default(50),
});

export const httpPersonaConfigSchema = z.object({
  userAgent: z.string().min(1),
  headers: z.record(z.string(), z.string()).optional(),
  headerOrder: z.array(z.string()).optional(),
  tlsClientHello: z.object({
    minVersion: z.enum(['TLS10', 'TLS11', 'TLS12', 'TLS13']).optional(),
    maxVersion: z.enum(['TLS10', 'TLS11', 'TLS12', 'TLS13']).optional(),
    cipherSuites: z.array(z.string()).optional(),
    curvePreferences: z.array(z.string()).optional(),
    ja3: z.string().optional(),
  }).optional(),
  http2Settings: z.object({
    enabled: z.boolean().default(false),
  }).optional(),
  cookieHandling: z.object({
    mode: z.enum(['session', 'none', 'ignore', 'file']).optional(),
  }).optional(),
  allowInsecureTls: z.boolean().optional(),
  requestTimeoutSec: z.number().min(0).optional(),
  requestTimeoutSeconds: z.number().min(0).optional(),
  maxRedirects: z.number().min(0).optional(),
  followRedirects: z.boolean().optional(),
  allowedStatusCodes: z.array(z.number().min(100).max(599)).optional(),
  rateLimitDps: z.number().min(0).optional(),
  rateLimitBurst: z.number().min(0).optional(),
  notes: z.string().optional(),
});

/**
 * Safely validates and parses DNS persona configuration from backend JSON
 */
export function validateDnsPersonaConfig(rawConfig: unknown): DnsPersonaConfig {
  try {
    return dnsPersonaConfigSchema.parse(rawConfig);
  } catch (error: unknown) {
    logger.error('DNS persona config validation failed', {
      component: 'PersonaConfigValidation',
      function: 'validateDnsPersonaConfig',
      error: error instanceof Error ? error.message : 'Unknown error',
      configType: 'dns'
    });
    throw new Error(`Invalid DNS persona configuration: ${error instanceof z.ZodError ? error.message : 'Unknown validation error'}`);
  }
}

/**
 * Safely validates and parses HTTP persona configuration from backend JSON
 */
export function validateHttpPersonaConfig(rawConfig: unknown): HttpPersonaConfig {
  try {
    return httpPersonaConfigSchema.parse(rawConfig);
  } catch (error: unknown) {
    logger.error('HTTP persona config validation failed', {
      component: 'PersonaConfigValidation',
      function: 'validateHttpPersonaConfig',
      error: error instanceof Error ? error.message : 'Unknown error',
      configType: 'http'
    });
    throw new Error(`Invalid HTTP persona configuration: ${error instanceof z.ZodError ? error.message : 'Unknown validation error'}`);
  }
}

/**
 * Safely serializes persona configuration for backend submission
 */
export function serializePersonaConfig(config: DnsPersonaConfig | HttpPersonaConfig): string {
  try {
    return JSON.stringify(config);
  } catch (error: unknown) {
    logger.error('Persona config serialization failed', {
      component: 'PersonaConfigValidation',
      function: 'serializePersonaConfig',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw new Error('Failed to serialize persona configuration');
  }
}

/**
 * Safely deserializes persona configuration from backend response
 */
export function deserializePersonaConfig(configJson: string | object, personaType: 'dns' | 'http'): DnsPersonaConfig | HttpPersonaConfig {
  try {
    const config = typeof configJson === 'string' ? JSON.parse(configJson) : configJson;
    
    if (personaType === 'dns') {
      return validateDnsPersonaConfig(config);
    } else {
      return validateHttpPersonaConfig(config);
    }
  } catch (error: unknown) {
    logger.error('Persona config deserialization failed', {
      component: 'PersonaConfigValidation',
      function: 'deserializePersonaConfig',
      error: error instanceof Error ? error.message : 'Unknown error',
      personaType
    });
    throw new Error(`Failed to deserialize ${personaType} persona configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
