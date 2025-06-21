// Simple verification script to check that isEnabled field is properly typed
import { personaSchema } from '../generated/validationSchemas';
import type { Persona } from '../../types';
import type { Persona as AlignedPersona } from '../../types/aligned/aligned-models';
import { createUUID, createISODateString } from '../../types/branded';

// Test 1: Verify Zod schema includes isEnabled
const testPersonaData = {
  name: 'Test Persona',
  personaType: 'dns' as const,
  configDetails: {
    resolvers: ['8.8.8.8'],
    useSystemResolvers: false,
    queryTimeoutSeconds: 30
  },
  isEnabled: true
};

const validationResult = personaSchema.safeParse(testPersonaData);
console.log('Zod validation result:', validationResult.success ? 'PASS' : 'FAIL');
if (!validationResult.success) {
  console.error('Validation errors:', validationResult.error.issues);
}

// Test 2: Verify TypeScript types include isEnabled
const typedPersona: Persona = {
  id: createUUID('123e4567-e89b-12d3-a456-426614174000'),
  name: 'Test Persona',
  personaType: 'dns',
  configDetails: {
    resolvers: ['8.8.8.8'],
    useSystemResolvers: false,
    queryTimeoutSeconds: 30,
    maxDomainsPerRequest: 100,
    resolverStrategy: 'random_rotation',
    concurrentQueriesPerDomain: 1,
    queryDelayMinMs: 0,
    queryDelayMaxMs: 0,
    maxConcurrentGoroutines: 10,
    rateLimitDps: 100,
    rateLimitBurst: 10
  },
  isEnabled: true,  // This field should be recognized
  status: 'active',
  createdAt: createISODateString('2025-06-20T12:00:00Z'),
  updatedAt: createISODateString('2025-06-20T12:00:00Z')
};

// Test 3: Verify aligned types include isEnabled
const alignedPersona: AlignedPersona = {
  id: createUUID('123e4567-e89b-12d3-a456-426614174000'),
  name: 'Test Persona',
  personaType: 'dns' as any,
  configDetails: {
    resolvers: ['8.8.8.8']
  } as any,
  isEnabled: true,  // This field should be recognized
  createdAt: createISODateString('2025-06-20T12:00:00Z'),
  updatedAt: createISODateString('2025-06-20T12:00:00Z')
};

console.log('TypeScript type check for Persona:', typedPersona.isEnabled !== undefined ? 'PASS' : 'FAIL');
console.log('TypeScript type check for AlignedPersona:', alignedPersona.isEnabled !== undefined ? 'PASS' : 'FAIL');

// Export to prevent unused variable errors
export { typedPersona, alignedPersona };