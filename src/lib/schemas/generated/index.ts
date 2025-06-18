// Re-export generated validation schemas and types
export * from './validationSchemas';

// Export enum schemas for standalone use
import { z } from 'zod';

export const personaTypeEnumSchema = z.enum(['dns', 'http']);
export const proxyProtocolEnumSchema = z.enum(['http', 'https', 'socks5', 'socks4']);
export const campaignTypeEnumSchema = z.enum(['domain_generation', 'dns_validation', 'http_keyword_validation']);
export const campaignStatusEnumSchema = z.enum(['pending', 'queued', 'running', 'pausing', 'paused', 'completed', 'failed', 'archived', 'cancelled']);
export const jobStatusEnumSchema = z.enum(['pending', 'queued', 'running', 'processing', 'completed', 'failed', 'retry']);
export const validationStatusEnumSchema = z.enum(['pending', 'valid', 'invalid', 'error', 'skipped']);
export const dnsValidationStatusEnumSchema = z.enum(['resolved', 'unresolved', 'timeout', 'error']);
export const httpValidationStatusEnumSchema = z.enum(['success', 'failed', 'timeout', 'error']);
export const keywordRuleTypeEnumSchema = z.enum(['string', 'regex']);
