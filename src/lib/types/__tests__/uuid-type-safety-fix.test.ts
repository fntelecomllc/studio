/**
 * UUID Type Safety Tests - MEDIUM Priority Fix M-001
 * 
 * Verifies that User, Persona, and Proxy entities properly use UUID branded types
 * instead of plain strings for their ID fields.
 * 
 * Issue: Contract violations matrix identified that these entities were using
 * `string` type for IDs instead of the branded `UUID` type, reducing type safety.
 */

import { describe, it, expect } from '@jest/globals';
import {
  UUID,
  createUUID,
  isUUID,
  ISODateString,
  createISODateString
} from '../branded';
import {
  ModelsUserAPI,
  ModelsPersonaAPI,
  ModelsProxyAPI,
  transformUserResponse,
  transformPersonaResponse,
  transformProxyResponse
} from '../models-aligned';

describe('UUID Type Safety - MEDIUM Priority Fix', () => {
  describe('User Entity UUID Type Safety', () => {
    it('should transform user ID to UUID type', () => {
      const rawUser = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        createdAt: '2024-01-15T10:30:00Z',
        updatedAt: '2024-01-15T10:30:00Z'
      };

      const user = transformUserResponse(rawUser);
      
      // Type assertion should work
      const userId: UUID = user.id!;
      expect(isUUID(userId)).toBe(true);
      
      // Verify the value is preserved
      expect(user.id).toBe(rawUser.id);
    });

    it('should handle missing user ID gracefully', () => {
      const rawUser = {
        email: 'test@example.com',
        createdAt: '2024-01-15T10:30:00Z',
        updatedAt: '2024-01-15T10:30:00Z'
      };

      const user = transformUserResponse(rawUser);
      expect(user.id).toBeUndefined();
    });

    it('should reject invalid UUID format for user', () => {
      const rawUser = {
        id: 'not-a-valid-uuid',
        email: 'test@example.com',
        createdAt: '2024-01-15T10:30:00Z',
        updatedAt: '2024-01-15T10:30:00Z'
      };

      expect(() => transformUserResponse(rawUser)).toThrow('Invalid UUID format');
    });

    it('should compile with proper type checking', () => {
      const user: ModelsUserAPI = {
        id: createUUID('123e4567-e89b-12d3-a456-426614174000'),
        email: 'test@example.com',
        emailVerified: true,
        firstName: 'John',
        lastName: 'Doe',
        isActive: true,
        isLocked: false,
        mfaEnabled: false,
        createdAt: createISODateString('2024-01-15T10:30:00Z'),
        updatedAt: createISODateString('2024-01-15T10:30:00Z'),
        roles: [],
        permissions: []
      };

      // This should compile without errors
      const userId: UUID = user.id!;
      expect(userId).toBeDefined();
      
      // This would cause a compile error if uncommented:
      // const wrongId: string = user.id!; // Error: Type 'UUID' is not assignable to type 'string'
    });
  });

  describe('Persona Entity UUID Type Safety', () => {
    it('should transform persona ID to UUID type', () => {
      const rawPersona = {
        id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        name: 'DNS Persona 1',
        personaType: 'dns',
        configDetails: { resolvers: ['8.8.8.8'] },
        isEnabled: true,
        createdAt: '2024-01-15T10:30:00Z',
        updatedAt: '2024-01-15T10:30:00Z'
      };

      const persona = transformPersonaResponse(rawPersona);
      
      // Type assertion should work
      const personaId: UUID = persona.id;
      expect(isUUID(personaId)).toBe(true);
      
      // Verify the value is preserved
      expect(persona.id).toBe(rawPersona.id);
    });

    it('should handle persona with frontend-only fields', () => {
      const rawPersona = {
        id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        name: 'HTTP Persona 1',
        personaType: 'http',
        configDetails: { userAgent: 'Test Agent' },
        isEnabled: true,
        status: 'active',
        lastTested: '2024-01-15T09:00:00Z',
        lastError: 'Connection timeout',
        tags: ['production', 'us-east'],
        createdAt: '2024-01-15T10:30:00Z',
        updatedAt: '2024-01-15T10:30:00Z'
      };

      const persona = transformPersonaResponse(rawPersona);
      
      expect(persona.status).toBe('active');
      expect(persona.lastTested).toBeTruthy();
      expect(persona.lastError).toBe('Connection timeout');
      expect(persona.tags).toEqual(['production', 'us-east']);
    });

    it('should reject invalid UUID format for persona', () => {
      const rawPersona = {
        id: 'invalid-uuid-format',
        name: 'Test Persona',
        personaType: 'dns',
        configDetails: {},
        isEnabled: true,
        createdAt: '2024-01-15T10:30:00Z',
        updatedAt: '2024-01-15T10:30:00Z'
      };

      expect(() => transformPersonaResponse(rawPersona)).toThrow('Invalid UUID format');
    });

    it('should compile with proper type checking for persona', () => {
      const persona: ModelsPersonaAPI = {
        id: createUUID('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'),
        name: 'Test Persona',
        personaType: 'http',
        configDetails: {},
        isEnabled: true,
        createdAt: createISODateString('2024-01-15T10:30:00Z'),
        updatedAt: createISODateString('2024-01-15T10:30:00Z')
      };

      // This should compile without errors
      const personaId: UUID = persona.id;
      expect(personaId).toBeDefined();
    });
  });

  describe('Proxy Entity UUID Type Safety', () => {
    it('should transform proxy ID to UUID type', () => {
      const rawProxy = {
        id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        name: 'US Proxy 1',
        address: 'proxy.example.com:8080',
        protocol: 'http',
        isEnabled: true,
        isHealthy: true,
        createdAt: '2024-01-15T10:30:00Z',
        updatedAt: '2024-01-15T10:30:00Z'
      };

      const proxy = transformProxyResponse(rawProxy);
      
      // Type assertion should work
      const proxyId: UUID = proxy.id;
      expect(isUUID(proxyId)).toBe(true);
      
      // Verify the value is preserved
      expect(proxy.id).toBe(rawProxy.id);
    });

    it('should handle all proxy fields correctly', () => {
      const rawProxy = {
        id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        name: 'Premium Proxy',
        description: 'High-speed proxy server',
        address: '192.168.1.100:3128',
        protocol: 'socks5',
        username: 'user123',
        host: '192.168.1.100',
        port: 3128,
        isEnabled: true,
        isHealthy: true,
        lastStatus: 'Connected',
        lastCheckedAt: '2024-01-15T10:25:00Z',
        latencyMs: 45,
        city: 'New York',
        countryCode: 'US',
        provider: 'ProxyProvider Inc',
        createdAt: '2024-01-15T10:30:00Z',
        updatedAt: '2024-01-15T10:30:00Z'
      };

      const proxy = transformProxyResponse(rawProxy);
      
      expect(proxy.name).toBe('Premium Proxy');
      expect(proxy.description).toBe('High-speed proxy server');
      expect(proxy.protocol).toBe('socks5');
      expect(proxy.username).toBe('user123');
      expect(proxy.port).toBe(3128);
      expect(proxy.latencyMs).toBe(45);
      expect(proxy.city).toBe('New York');
      expect(proxy.countryCode).toBe('US');
      expect(proxy.lastCheckedAt).toBeTruthy();
    });

    it('should reject invalid UUID format for proxy', () => {
      const rawProxy = {
        id: '12345',
        name: 'Test Proxy',
        address: 'proxy.test.com:8080',
        isEnabled: true,
        isHealthy: false,
        createdAt: '2024-01-15T10:30:00Z',
        updatedAt: '2024-01-15T10:30:00Z'
      };

      expect(() => transformProxyResponse(rawProxy)).toThrow('Invalid UUID format');
    });

    it('should compile with proper type checking for proxy', () => {
      const proxy: ModelsProxyAPI = {
        id: createUUID('f47ac10b-58cc-4372-a567-0e02b2c3d479'),
        name: 'Test Proxy',
        address: 'proxy.test.com:8080',
        isEnabled: true,
        isHealthy: true,
        createdAt: createISODateString('2024-01-15T10:30:00Z'),
        updatedAt: createISODateString('2024-01-15T10:30:00Z')
      };

      // This should compile without errors
      const proxyId: UUID = proxy.id;
      expect(proxyId).toBeDefined();
    });
  });

  describe('Type Safety Guarantees', () => {
    it('should prevent mixing UUID types with strings', () => {
      const user = transformUserResponse({
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'test@example.com',
        createdAt: '2024-01-15T10:30:00Z',
        updatedAt: '2024-01-15T10:30:00Z'
      });

      // These operations should work
      const uuid1: UUID = user.id!;
      const uuid2: UUID = createUUID('550e8400-e29b-41d4-a716-446655440000');
      
      // Can compare UUIDs
      expect(uuid1).toBe(uuid2);
      
      // Can use in collections
      const uuidSet = new Set<UUID>([uuid1, uuid2]);
      expect(uuidSet.size).toBe(1);
      
      // Can use as object keys (they're still strings at runtime)
      const uuidMap: Record<UUID, string> = {
        [uuid1]: 'User 1'
      };
      expect(uuidMap[uuid1]).toBe('User 1');
    });

    it('should maintain UUID branding through serialization', () => {
      const originalUUID = createUUID('550e8400-e29b-41d4-a716-446655440000');
      
      // Serialize to JSON
      const json = JSON.stringify({ id: originalUUID });
      
      // Parse back
      const parsed = JSON.parse(json);
      
      // Re-create UUID with branding
      const restoredUUID = createUUID(parsed.id);
      
      expect(restoredUUID).toBe(originalUUID);
      expect(isUUID(restoredUUID)).toBe(true);
    });
  });

  describe('Migration Path Validation', () => {
    it('should handle legacy code using string IDs', () => {
      // Simulate legacy API response with string IDs
      const legacyResponse = {
        users: [
          { id: '550e8400-e29b-41d4-a716-446655440000', name: 'User 1' },
          { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', name: 'User 2' }
        ]
      };

      // Transform to type-safe versions
      const typeSafeUsers = legacyResponse.users.map(u => ({
        ...u,
        id: createUUID(u.id)
      }));

      // Now we have type safety
      typeSafeUsers.forEach(user => {
        const userId: UUID = user.id;
        expect(isUUID(userId)).toBe(true);
      });
    });

    it('should provide clear error messages for invalid UUIDs', () => {
      const invalidIds = [
        '',
        'not-a-uuid',
        '12345',
        'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
        '550e8400-e29b-41d4-a716' // incomplete
      ];

      invalidIds.forEach(id => {
        expect(() => createUUID(id)).toThrow('Invalid UUID format');
      });
    });
  });
});

/**
 * Type-level tests (these are compile-time checks, not runtime)
 * These are commented out as they would cause compilation errors.
 * Uncomment any of these to verify TypeScript's type checking.
 */

// Example 1: Should not allow string assignment to UUID
// const wrongType: UUID = 'plain-string'; // Error: Type 'string' is not assignable to type 'UUID'

// Example 2: Should not allow UUID assignment to string without explicit conversion
// const wrongString: string = createUUID('550e8400-e29b-41d4-a716-446655440000'); // Error: Type 'UUID' is not assignable to type 'string'

// Example 3: Correct way to convert UUID to string if needed
// const correctString: string = createUUID('550e8400-e29b-41d4-a716-446655440000').toString();