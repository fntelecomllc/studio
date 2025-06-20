import { describe, it, expect } from '@jest/globals';
import {
  transformUserResponse,
  transformLoginResponse,
  transformUserArrayResponse,
  transformUserRequestData,
  parsePermissions,
  serializePermissions,
  UserAPIAligned,
  Permission
} from '../auth-transformers';
import { ModelsUserAPI } from '../../../api-client/models/models-user-api';
import { ModelsLoginResponseAPI } from '../../../api-client/models/models-login-response-api';

// Mock the branded types module
jest.mock('../../../types/branded', () => ({
  createUUID: (id: string) => id,
  createISODateString: (date: string) => date,
  UUID: String,
  ISODateString: String
}));

describe('Auth Transformers', () => {
  describe('transformUserResponse', () => {
    it('should transform raw user API response to aligned model', () => {
      const rawUser: ModelsUserAPI = {
        id: '12345',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        name: 'John Doe',
        isActive: true,
        isLocked: false,
        emailVerified: true,
        mfaEnabled: false,
        mustChangePassword: false,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        lastLoginAt: '2024-01-01T12:00:00Z',
        lastLoginIp: '192.168.1.1',
        permissions: ['read:users', 'write:users'],
        roles: ['admin']
      };

      const result = transformUserResponse(rawUser);

      expect(result).toEqual({
        id: '12345',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        name: 'John Doe',
        isActive: true,
        isLocked: false,
        emailVerified: true,
        mfaEnabled: false,
        mustChangePassword: false,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        lastLoginAt: '2024-01-01T12:00:00Z',
        lastLoginIp: '192.168.1.1',
        permissions: ['read:users', 'write:users'],
        roles: ['admin'],
        avatarUrl: undefined,
        mfaLastUsedAt: undefined
      });
    });

    it('should handle optional fields', () => {
      const minimalUser: ModelsUserAPI = {
        email: 'minimal@example.com'
      };

      const result = transformUserResponse(minimalUser);

      expect(result.email).toBe('minimal@example.com');
      expect(result.id).toBeUndefined();
      expect(result.createdAt).toBeUndefined();
      expect(result.firstName).toBeUndefined();
    });

    it('should handle all date fields', () => {
      const userWithDates: ModelsUserAPI = {
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        lastLoginAt: '2024-01-03T00:00:00Z',
        mfaLastUsedAt: '2024-01-04T00:00:00Z'
      };

      const result = transformUserResponse(userWithDates);

      expect(result.createdAt).toBe('2024-01-01T00:00:00Z');
      expect(result.updatedAt).toBe('2024-01-02T00:00:00Z');
      expect(result.lastLoginAt).toBe('2024-01-03T00:00:00Z');
      expect(result.mfaLastUsedAt).toBe('2024-01-04T00:00:00Z');
    });
  });

  describe('transformLoginResponse', () => {
    it('should transform raw login response to aligned model', () => {
      const rawResponse: ModelsLoginResponseAPI = {
        success: true,
        sessionId: 'session-123',
        expiresAt: '2024-01-02T00:00:00Z',
        user: {
          id: '12345',
          email: 'test@example.com',
          firstName: 'John',
          roles: ['user']
        }
      };

      const result = transformLoginResponse(rawResponse);

      expect(result).toEqual({
        success: true,
        sessionId: 'session-123',
        expiresAt: '2024-01-02T00:00:00Z',
        user: {
          id: '12345',
          email: 'test@example.com',
          firstName: 'John',
          roles: ['user'],
          lastName: undefined,
          name: undefined,
          isActive: undefined,
          isLocked: undefined,
          emailVerified: undefined,
          mfaEnabled: undefined,
          mustChangePassword: undefined,
          createdAt: undefined,
          updatedAt: undefined,
          lastLoginAt: undefined,
          lastLoginIp: undefined,
          permissions: undefined,
          avatarUrl: undefined,
          mfaLastUsedAt: undefined
        },
        error: undefined,
        requiresCaptcha: undefined
      });
    });

    it('should handle requiresCaptcha field name mismatch', () => {
      const rawWithCaptcha: any = {
        success: false,
        error: 'Too many attempts',
        requiresCaptcha: true
      };

      const result = transformLoginResponse(rawWithCaptcha);

      expect(result.requiresCaptcha).toBe(true);
    });

    it('should handle requires_captcha snake_case field', () => {
      const rawWithSnakeCase: any = {
        success: false,
        error: 'Too many attempts',
        requires_captcha: true
      };

      const result = transformLoginResponse(rawWithSnakeCase);

      expect(result.requiresCaptcha).toBe(true);
    });

    it('should handle response without user', () => {
      const errorResponse: ModelsLoginResponseAPI = {
        success: false,
        error: 'Invalid credentials'
      };

      const result = transformLoginResponse(errorResponse);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid credentials');
      expect(result.user).toBeUndefined();
    });
  });

  describe('transformUserArrayResponse', () => {
    it('should transform array of users', () => {
      const rawUsers: ModelsUserAPI[] = [
        { id: '1', email: 'user1@example.com' },
        { id: '2', email: 'user2@example.com' },
        { id: '3', email: 'user3@example.com' }
      ];

      const result = transformUserArrayResponse(rawUsers);

      expect(result).toHaveLength(3);
      expect(result[0]?.id).toBe('1');
      expect(result[0]?.email).toBe('user1@example.com');
      expect(result[2]?.id).toBe('3');
    });

    it('should handle empty array', () => {
      const result = transformUserArrayResponse([]);

      expect(result).toEqual([]);
    });
  });

  describe('transformUserRequestData', () => {
    it('should transform user data for API requests', () => {
      const userData: Partial<UserAPIAligned> = {
        email: 'new@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
        isActive: true,
        roles: ['user', 'moderator']
      };

      const result = transformUserRequestData(userData);

      expect(result).toEqual({
        email: 'new@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
        isActive: true,
        roles: ['user', 'moderator']
      });
    });

    it('should handle all fields', () => {
      const fullUserData: UserAPIAligned = {
        avatarUrl: 'https://example.com/avatar.jpg',
        createdAt: '2024-01-01T00:00:00Z' as any, // Cast to bypass brand check in test
        email: 'full@example.com',
        emailVerified: true,
        firstName: 'Full',
        id: '12345' as any, // Cast to bypass brand check in test
        isActive: true,
        isLocked: false,
        lastLoginAt: '2024-01-01T12:00:00Z' as any, // Cast to bypass brand check in test
        lastLoginIp: '192.168.1.1',
        lastName: 'User',
        mfaEnabled: true,
        mfaLastUsedAt: '2024-01-01T13:00:00Z' as any, // Cast to bypass brand check in test
        mustChangePassword: false,
        name: 'Full User',
        permissions: ['read:all'],
        roles: ['admin'],
        updatedAt: '2024-01-01T00:00:00Z' as any // Cast to bypass brand check in test
      };

      const result = transformUserRequestData(fullUserData);

      expect(Object.keys(result)).toHaveLength(18);
      expect(result.email).toBe('full@example.com');
      expect(result.id).toBe('12345');
    });

    it('should only include defined fields', () => {
      const sparseData: Partial<UserAPIAligned> = {
        email: 'sparse@example.com',
        firstName: undefined,
        lastName: 'Sparse'
      };

      const result = transformUserRequestData(sparseData);

      expect(result).toEqual({
        email: 'sparse@example.com',
        lastName: 'Sparse'
      });
      expect(result.firstName).toBeUndefined();
    });
  });

  describe('parsePermissions', () => {
    it('should parse string permissions to permission objects', () => {
      const permissions = ['read:users', 'write:posts', 'delete:comments'];

      const result = parsePermissions(permissions);

      expect(result).toEqual([
        {
          name: 'read:users',
          resource: 'read',
          action: 'users',
          displayName: 'Read Users'
        },
        {
          name: 'write:posts',
          resource: 'write',
          action: 'posts',
          displayName: 'Write Posts'
        },
        {
          name: 'delete:comments',
          resource: 'delete',
          action: 'comments',
          displayName: 'Delete Comments'
        }
      ]);
    });

    it('should handle permissions without colons', () => {
      const permissions = ['admin', 'super_user'];

      const result = parsePermissions(permissions);

      expect(result).toEqual([
        {
          name: 'admin',
          resource: 'admin',
          action: undefined,
          displayName: 'Admin'
        },
        {
          name: 'super_user',
          resource: 'super_user',
          action: undefined,
          displayName: 'Super User'
        }
      ]);
    });

    it('should handle empty array', () => {
      const result = parsePermissions([]);

      expect(result).toEqual([]);
    });

    it('should handle complex permission names', () => {
      const permissions = ['system:user_management:create'];

      const result = parsePermissions(permissions);

      expect(result[0]).toEqual({
        name: 'system:user_management:create',
        resource: 'system',
        action: 'user_management', // Only splits on first colon
        displayName: 'System User Management Create'
      });
    });
  });

  describe('serializePermissions', () => {
    it('should convert permission objects back to strings', () => {
      const permissions: Permission[] = [
        {
          name: 'read:users',
          resource: 'read',
          action: 'users',
          displayName: 'Read Users'
        },
        {
          name: 'write:posts',
          resource: 'write',
          action: 'posts',
          displayName: 'Write Posts'
        }
      ];

      const result = serializePermissions(permissions);

      expect(result).toEqual(['read:users', 'write:posts']);
    });

    it('should handle empty array', () => {
      const result = serializePermissions([]);

      expect(result).toEqual([]);
    });

    it('should use name field regardless of other properties', () => {
      const permissions: Permission[] = [
        {
          name: 'custom:permission',
          resource: 'different',
          action: 'values',
          displayName: 'Something Else'
        }
      ];

      const result = serializePermissions(permissions);

      expect(result).toEqual(['custom:permission']);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null values gracefully', () => {
      const userWithNulls: any = {
        id: null,
        email: 'test@example.com',
        createdAt: null,
        permissions: null
      };

      const result = transformUserResponse(userWithNulls);

      expect(result.id).toBeUndefined();
      expect(result.email).toBe('test@example.com');
      expect(result.createdAt).toBeUndefined();
      expect(result.permissions).toBeNull();
    });

    it('should handle malformed dates', () => {
      const userWithBadDates: ModelsUserAPI = {
        createdAt: 'not-a-date',
        updatedAt: ''
      };

      const result = transformUserResponse(userWithBadDates);

      // Dates are passed through as-is to branded type creator
      expect(result.createdAt).toBe('not-a-date');
      // Empty string is not transformed to undefined
      expect(result.updatedAt).toBeUndefined();
    });
  });
});