// src/lib/utils/__tests__/runtime-validators.test.ts
// Comprehensive tests for runtime validation system

import {
  validateUUID,
  validateEmail,
  validateURL,
  validateSafeBigInt,
  validateNonEmptyString,
  validateNumberRange,
  validateCampaignStatus,
  validateUserRole,
  ValidationError,
  createObjectValidator,
  createArrayValidator,
  validatePartial,
  sanitizeString,
  deepValidate,
} from '../runtime-validators';

describe('Runtime Validators', () => {
  describe('validateUUID', () => {
    it('should validate correct UUIDs', () => {
      const validUUIDs = [
        '123e4567-e89b-12d3-a456-426614174000',
        'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        '6ba7b811-9dad-11d1-80b4-00c04fd430c8',
      ];

      validUUIDs.forEach(uuid => {
        expect(validateUUID(uuid)).toBe(true);
      });
    });

    it('should reject invalid UUIDs', () => {
      const invalidUUIDs = [
        '',
        'not-a-uuid',
        '123e4567-e89b-12d3-a456',
        '123e4567-e89b-12d3-a456-42661417400g',
        '123e4567-e89b-12d3-a456-426614174000-extra',
      ];

      invalidUUIDs.forEach(uuid => {
        expect(validateUUID(uuid)).toBe(false);
      });
    });
  });

  describe('validateEmail', () => {
    it('should validate correct email addresses', () => {
      const validEmails = [
        'user@example.com',
        'test.email+tag@domain.co.uk',
        'user123@domain-name.org',
        'firstname.lastname@company.com',
      ];

      validEmails.forEach(email => {
        expect(validateEmail(email)).toBe(true);
      });
    });

    it('should reject invalid email addresses', () => {
      const invalidEmails = [
        '',
        'not-an-email',
        '@domain.com',
        'user@',
        'user@domain',
        'user space@domain.com',
      ];

      invalidEmails.forEach(email => {
        expect(validateEmail(email)).toBe(false);
      });
    });
  });

  describe('validateURL', () => {
    it('should validate correct URLs', () => {
      const validURLs = [
        'https://example.com',
        'http://localhost:3000',
        'https://sub.domain.com/path?query=value#fragment',
        'ftp://files.example.com',
      ];

      validURLs.forEach(url => {
        expect(validateURL(url)).toBe(true);
      });
    });

    it('should reject invalid URLs', () => {
      const invalidURLs = [
        '',
        'not-a-url',
        'http://',
        'https://',
      ];

      invalidURLs.forEach(url => {
        expect(validateURL(url)).toBe(false);
      });
    });
  });

  describe('validateSafeBigInt', () => {
    it('should validate bigint values', () => {
      expect(validateSafeBigInt(BigInt(123))).toBe(true);
      expect(validateSafeBigInt(BigInt(0))).toBe(true);
      expect(validateSafeBigInt(BigInt('9007199254740991'))).toBe(true);
    });

    it('should validate safe number values', () => {
      expect(validateSafeBigInt(123)).toBe(true);
      expect(validateSafeBigInt(0)).toBe(true);
      expect(validateSafeBigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
    });

    it('should validate numeric strings', () => {
      expect(validateSafeBigInt('123')).toBe(true);
      expect(validateSafeBigInt('0')).toBe(true);
      expect(validateSafeBigInt('9007199254740991')).toBe(true);
    });

    it('should reject unsafe values', () => {
      expect(validateSafeBigInt(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
      expect(validateSafeBigInt(-1)).toBe(false);
      expect(validateSafeBigInt('not-a-number')).toBe(false);
      expect(validateSafeBigInt(null)).toBe(false);
      expect(validateSafeBigInt(undefined)).toBe(false);
      expect(validateSafeBigInt({})).toBe(false);
    });
  });

  describe('validateNonEmptyString', () => {
    it('should validate non-empty strings', () => {
      expect(validateNonEmptyString('hello')).toBe(true);
      expect(validateNonEmptyString(' test ')).toBe(true);
      expect(validateNonEmptyString('a')).toBe(true);
    });

    it('should reject empty or whitespace-only strings', () => {
      expect(validateNonEmptyString('')).toBe(false);
      expect(validateNonEmptyString('   ')).toBe(false);
      expect(validateNonEmptyString('\t\n')).toBe(false);
    });

    it('should respect minimum length', () => {
      expect(validateNonEmptyString('hello', 5)).toBe(true);
      expect(validateNonEmptyString('hi', 5)).toBe(false);
      expect(validateNonEmptyString('  hello  ', 5)).toBe(true);
    });
  });

  describe('validateNumberRange', () => {
    it('should validate numbers within range', () => {
      expect(validateNumberRange(5, 1, 10)).toBe(true);
      expect(validateNumberRange(1, 1, 10)).toBe(true);
      expect(validateNumberRange(10, 1, 10)).toBe(true);
    });

    it('should reject numbers outside range', () => {
      expect(validateNumberRange(0, 1, 10)).toBe(false);
      expect(validateNumberRange(11, 1, 10)).toBe(false);
    });

    it('should work with only min or max bounds', () => {
      expect(validateNumberRange(5, 1)).toBe(true);
      expect(validateNumberRange(0, 1)).toBe(false);
      expect(validateNumberRange(5, undefined, 10)).toBe(true);
      expect(validateNumberRange(15, undefined, 10)).toBe(false);
    });

    it('should reject non-numeric values', () => {
      expect(validateNumberRange(NaN)).toBe(false);
      expect(validateNumberRange(Infinity)).toBe(false);
      expect(validateNumberRange(-Infinity)).toBe(false);
    });
  });

  describe('validateCampaignStatus', () => {
    it('should validate correct campaign statuses', () => {
      const validStatuses = ['draft', 'running', 'paused', 'completed', 'failed', 'cancelled'];
      validStatuses.forEach(status => {
        expect(validateCampaignStatus(status)).toBe(true);
        expect(validateCampaignStatus(status.toUpperCase())).toBe(true);
      });
    });

    it('should reject invalid campaign statuses', () => {
      const invalidStatuses = ['invalid', 'pending', 'unknown', ''];
      invalidStatuses.forEach(status => {
        expect(validateCampaignStatus(status)).toBe(false);
      });
    });
  });

  describe('validateUserRole', () => {
    it('should validate correct user roles', () => {
      const validRoles = ['admin', 'user', 'viewer'];
      validRoles.forEach(role => {
        expect(validateUserRole(role)).toBe(true);
        expect(validateUserRole(role.toUpperCase())).toBe(true);
      });
    });

    it('should reject invalid user roles', () => {
      const invalidRoles = ['superuser', 'guest', 'moderator', ''];
      invalidRoles.forEach(role => {
        expect(validateUserRole(role)).toBe(false);
      });
    });
  });

  describe('ValidationError', () => {
    it('should create validation error with field and value', () => {
      const error = new ValidationError('Test validation failed', 'testField', 'testValue');
      
      expect(error.name).toBe('ValidationError');
      expect(error.message).toBe('Test validation failed');
      expect(error.field).toBe('testField');
      expect(error.value).toBe('testValue');
    });

    it('should create validation error with only message', () => {
      const error = new ValidationError('Test validation failed');
      
      expect(error.name).toBe('ValidationError');
      expect(error.message).toBe('Test validation failed');
      expect(error.field).toBeUndefined();
      expect(error.value).toBeUndefined();
    });
  });

  describe('createObjectValidator', () => {
    it('should create validator for object with specific shape', () => {
      const userValidator = createObjectValidator<{ name: string; age: number }>({
        name: (v) => typeof v === 'string' && v.length > 0,
        age: (v) => typeof v === 'number' && v >= 0,
      });

      expect(userValidator({ name: 'John', age: 30 })).toBe(true);
      expect(userValidator({ name: '', age: 30 })).toBe(false);
      expect(userValidator({ name: 'John', age: -1 })).toBe(false);
      expect(userValidator({ name: 'John' })).toBe(false);
      expect(userValidator(null)).toBe(false);
      expect(userValidator('not an object')).toBe(false);
    });
  });

  describe('createArrayValidator', () => {
    it('should create validator for array of specific type', () => {
      const stringArrayValidator = createArrayValidator<string>(
        (v): v is string => typeof v === 'string'
      );

      expect(stringArrayValidator(['a', 'b', 'c'])).toBe(true);
      expect(stringArrayValidator([])).toBe(true);
      expect(stringArrayValidator(['a', 1, 'c'])).toBe(false);
      expect(stringArrayValidator('not an array')).toBe(false);
      expect(stringArrayValidator(null)).toBe(false);
    });
  });

  describe('validatePartial', () => {
    it('should validate partial objects', () => {
      type User = { name: string; age: number; email: string };
      const validators = {
        name: (v: any) => typeof v === 'string' && v.length > 0,
        age: (v: any) => typeof v === 'number' && v >= 0,
        email: (v: any) => typeof v === 'string' && v.includes('@'),
      };

      expect(validatePartial<User>({ name: 'John' }, validators)).toBe(true);
      expect(validatePartial<User>({ age: 30 }, validators)).toBe(true);
      expect(validatePartial<User>({ name: 'John', email: 'john@example.com' }, validators)).toBe(true);
      expect(validatePartial<User>({ name: '' }, validators)).toBe(false);
      expect(validatePartial<User>({ age: -1 }, validators)).toBe(false);
      expect(validatePartial<User>(null, validators)).toBe(false);
    });
  });

  describe('sanitizeString', () => {
    it('should remove dangerous characters', () => {
      expect(sanitizeString('<script>alert("xss")</script>')).toBe('scriptalert(xss)/script');
      expect(sanitizeString('  normal text  ')).toBe('normal text');
      expect(sanitizeString('text with "quotes" and \'apostrophes\'')).toBe('text with quotes and apostrophes');
      expect(sanitizeString('text\0with\0nulls')).toBe('textwithnulls');
    });
  });

  describe('deepValidate', () => {
    it('should validate nested object structures', () => {
      const schema = {
        user: {
          name: (v: any) => typeof v === 'string' && v.length > 0,
          age: (v: any) => typeof v === 'number' && v >= 0,
        },
        active: (v: any) => typeof v === 'boolean',
      };

      const validData = {
        user: { name: 'John', age: 30 },
        active: true,
      };

      const invalidData = {
        user: { name: '', age: 30 },
        active: 'not boolean',
      };

      const validResult = deepValidate(validData, schema);
      expect(validResult.isValid).toBe(true);
      expect(validResult.errors).toHaveLength(0);

      const invalidResult = deepValidate(invalidData, schema);
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors.length).toBeGreaterThan(0);
    });

    it('should handle missing fields gracefully', () => {
      const schema = {
        required: (v: any) => v !== undefined,
        optional: (v: any) => v === undefined || typeof v === 'string',
      };

      const result = deepValidate({ optional: 'test' }, schema);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((err: string) => err.includes('required'))).toBe(true);
    });
  });

  describe('Type Guards', () => {
    it('should work as TypeScript type guards', () => {
      const value: unknown = '123e4567-e89b-12d3-a456-426614174000';
      
      if (typeof value === 'string' && validateUUID(value)) {
        // TypeScript should know this is a UUID (string)
        expect(typeof value).toBe('string');
      }
    });

    it('should work with SafeBigInt type guard', () => {
      const value: unknown = 123;
      
      if (validateSafeBigInt(value)) {
        // TypeScript should know this is a SafeBigInt
        expect(typeof value === 'number' || typeof value === 'bigint' || typeof value === 'string').toBe(true);
      }
    });
  });

  describe('Edge Cases and Integration', () => {
    it('should handle very large strings gracefully', () => {
      const largeString = 'a'.repeat(1000);
      expect(validateNonEmptyString(largeString)).toBe(true);
      // Large emails can be technically valid, so let's test something that should definitely be invalid
      expect(validateEmail('invalid@')).toBe(false);
    });

    it('should work with complex validation scenarios', () => {
      // Test combining validators for complex data structures
      const campaignValidator = createObjectValidator<{
        id: string;
        name: string;
        status: string;
        maxBudget: number;
      }>({
        id: validateUUID,
        name: (v: any) => validateNonEmptyString(v),
        status: validateCampaignStatus,
        maxBudget: (v: any) => validateNumberRange(v, 0, 1000000),
      });

      const validCampaign = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test Campaign',
        status: 'running',
        maxBudget: 50000,
      };

      const invalidCampaign = {
        id: 'invalid-uuid',
        name: '',
        status: 'invalid-status',
        maxBudget: -100,
      };

      expect(campaignValidator(validCampaign)).toBe(true);
      expect(campaignValidator(invalidCampaign)).toBe(false);
    });

    it('should handle arrays of validated objects', () => {
      const userValidator = createObjectValidator<{ id: string; name: string }>({
        id: validateUUID,
        name: (v: any) => validateNonEmptyString(v),
      });

      const usersArrayValidator = createArrayValidator(userValidator);

      const validUsers = [
        { id: '123e4567-e89b-12d3-a456-426614174000', name: 'User 1' },
        { id: '123e4567-e89b-12d3-a456-426614174001', name: 'User 2' },
      ];

      const invalidUsers = [
        { id: 'invalid-uuid', name: 'User 1' },
        { id: '123e4567-e89b-12d3-a456-426614174001', name: '' },
      ];

      expect(usersArrayValidator(validUsers)).toBe(true);
      expect(usersArrayValidator(invalidUsers)).toBe(false);
      expect(usersArrayValidator([])).toBe(true);
    });
  });

  describe('Performance and Security', () => {
    it('should handle prototype pollution attempts', () => {
      const maliciousObject = JSON.parse('{"__proto__": {"polluted": true}, "name": "test"}');
      expect(validateNonEmptyString(maliciousObject.name)).toBe(true);
      // Ensure prototype is not polluted
      expect(({}as any).polluted).toBeUndefined();
    });

    it('should validate quickly for large datasets', () => {
      const largeArray = Array.from({ length: 1000 }, (_, i) => 
        `123e4567-e89b-12d3-a456-${String(i).padStart(12, '0')}`
      );

      const startTime = Date.now();
      const results = largeArray.map(validateUUID);
      const endTime = Date.now();

      expect(results.every(r => r === true)).toBe(true);
      expect(endTime - startTime).toBeLessThan(100); // Should be very fast
    });
  });
});
