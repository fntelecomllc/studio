// src/tests/unit/validation.test.ts
// Unit tests for Phase 5 runtime validation system

import { describe, it, expect } from 'vitest';
import { 
  validateUUID, 
  validateSafeBigInt, 
  validateEmail, 
  validateURL,
  validatePermissions 
} from '@/lib/utils/runtime-validators';

describe('Runtime Validators Unit Tests', () => {
  describe('validateUUID', () => {
    it('should validate correct UUID v4 format', () => {
      const validUUIDs = [
        '123e4567-e89b-12d3-a456-426614174000',
        'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
      ];

      validUUIDs.forEach(uuid => {
        expect(validateUUID(uuid)).toBe(true);
      });
    });

    it('should reject invalid UUID formats', () => {
      const invalidUUIDs = [
        'invalid-uuid',
        '123456789',
        'g47ac10b-58cc-4372-a567-0e02b2c3d479', // invalid character
        '123e4567-e89b-12d3-a456-42661417400', // too short
        '123e4567-e89b-12d3-a456-426614174000-extra', // too long
        null,
        undefined,
        123,
        '',
        {}
      ];

      invalidUUIDs.forEach(uuid => {
        expect(validateUUID(uuid)).toBe(false);
      });
    });
  });

  describe('validateSafeBigInt', () => {
    it('should validate BigInt values', () => {
      const validBigInts = [
        1000n,
        BigInt(1000),
        BigInt('9007199254740991'), // MAX_SAFE_INTEGER as BigInt
        0n
      ];

      validBigInts.forEach(value => {
        expect(validateSafeBigInt(value)).toBe(true);
      });
    });

    it('should validate number values within safe range', () => {
      const validNumbers = [
        0,
        1000,
        Number.MAX_SAFE_INTEGER,
        -Number.MAX_SAFE_INTEGER
      ];

      validNumbers.forEach(value => {
        expect(validateSafeBigInt(value)).toBe(true);
      });
    });

    it('should reject invalid values', () => {
      const invalidValues = [
        '1000',
        null,
        undefined,
        Number.MAX_SAFE_INTEGER + 1,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        NaN,
        {},
        []
      ];

      invalidValues.forEach(value => {
        expect(validateSafeBigInt(value)).toBe(false);
      });
    });
  });

  describe('validateEmail', () => {
    it('should validate correct email formats', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.com',
        'user+tag@domain.co.uk',
        'admin@subdomain.domain.org',
        'simple@example.co',
        'very.common@example.com',
        'disposable.style.email.with+symbol@example.com'
      ];

      validEmails.forEach(email => {
        expect(validateEmail(email)).toBe(true);
      });
    });

    it('should reject invalid email formats', () => {
      const invalidEmails = [
        'invalid-email',
        '@domain.com',
        'user@',
        'user..double.dot@example.com',
        'user@domain',
        '',
        null,
        undefined,
        123,
        'user@domain..com',
        'user name@domain.com' // space in email
      ];

      invalidEmails.forEach(email => {
        expect(validateEmail(email)).toBe(false);
      });
    });
  });

  describe('validateURL', () => {
    it('should validate correct URL formats', () => {
      const validURLs = [
        'https://example.com',
        'http://subdomain.example.org',
        'https://example.com/path',
        'https://example.com/path?query=value',
        'https://example.com:8080',
        'https://192.168.1.1',
        'https://localhost:3000'
      ];

      validURLs.forEach(url => {
        expect(validateURL(url)).toBe(true);
      });
    });

    it('should reject invalid URL formats', () => {
      const invalidURLs = [
        'not-a-url',
        'ftp://example.com', // unsupported protocol
        'example.com', // missing protocol
        '',
        null,
        undefined,
        123,
        'https://',
        'https://.'
      ];

      invalidURLs.forEach(url => {
        expect(validateURL(url)).toBe(false);
      });
    });
  });

  describe('validatePermissions', () => {
    it('should validate permission arrays', () => {
      const validPermissions = [
        ['campaigns:read'],
        ['campaigns:read', 'campaigns:write'],
        ['admin:users', 'campaigns:create', 'personas:read'],
        []
      ];

      validPermissions.forEach(permissions => {
        expect(validatePermissions(permissions)).toBe(true);
      });
    });

    it('should reject invalid permission formats', () => {
      const invalidPermissions = [
        'campaigns:read', // string instead of array
        [123], // number in array
        [null], // null in array
        [''], // empty string in array
        null,
        undefined,
        {},
        ['invalid permission format'], // invalid format
        ['campaigns:'], // missing action
        [':read'] // missing resource
      ];

      invalidPermissions.forEach(permissions => {
        expect(validatePermissions(permissions)).toBe(false);
      });
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle circular references safely', () => {
      const circular: any = { prop: null };
      circular.prop = circular;

      expect(validateUUID(circular)).toBe(false);
      expect(validateEmail(circular)).toBe(false);
      expect(validateURL(circular)).toBe(false);
    });

    it('should handle very large strings', () => {
      const largeString = 'a'.repeat(10000);
      
      expect(validateUUID(largeString)).toBe(false);
      expect(validateEmail(largeString)).toBe(false);
    });

    it('should handle special characters safely', () => {
      const specialChars = ['<script>', '\'DROP TABLE', '\x00', '\n\r\t'];
      
      specialChars.forEach(char => {
        expect(validateUUID(char)).toBe(false);
        expect(validateEmail(char)).toBe(false);
        expect(validateURL(char)).toBe(false);
      });
    });
  });

  describe('Performance validation', () => {
    it('should validate large arrays efficiently', () => {
      const largePermissionArray = Array.from({ length: 1000 }, (_, i) => `resource${i}:action`);
      
      const startTime = performance.now();
      const result = validatePermissions(largePermissionArray);
      const endTime = performance.now();
      
      expect(result).toBe(true);
      expect(endTime - startTime).toBeLessThan(50); // Should complete in < 50ms
    });

    it('should handle repeated validation calls efficiently', () => {
      const testData = [
        '123e4567-e89b-12d3-a456-426614174000',
        'test@example.com',
        'https://example.com',
        1000n
      ];
      
      const startTime = performance.now();
      
      // Run 1000 validation cycles
      for (let i = 0; i < 1000; i++) {
        validateUUID(testData[0]);
        validateEmail(testData[1]);
        validateURL(testData[2]);
        validateSafeBigInt(testData[3]);
      }
      
      const endTime = performance.now();
      
      expect(endTime - startTime).toBeLessThan(100); // Should complete in < 100ms
    });
  });
});
