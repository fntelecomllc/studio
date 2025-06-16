import { generateCharsForNth, calculateMaxSldCombinations, domainFromIndex } from '../domain-generator-utils';
import type { DomainGenerationConfig } from '@/lib/types';

describe('Domain Generator Utilities', () => {
  describe('generateCharsForNth', () => {
    const charSet = ['a', 'b'];
    it('should generate the 0th combination', () => {
      expect(generateCharsForNth(0, 2, charSet)).toBe('aa');
    });
    it('should generate the 1st combination', () => {
      expect(generateCharsForNth(1, 2, charSet)).toBe('ab');
    });
    it('should generate the 2nd combination', () => {
      expect(generateCharsForNth(2, 2, charSet)).toBe('ba');
    });
    it('should generate the 3rd combination', () => {
      expect(generateCharsForNth(3, 2, charSet)).toBe('bb');
    });
    it('should return null if n is out of bounds', () => {
      expect(generateCharsForNth(4, 2, charSet)).toBeNull();
    });
    it('should handle length 0', () => {
      expect(generateCharsForNth(0, 0, charSet)).toBe('');
    });
    it('should handle empty charset for length 0', () => {
      expect(generateCharsForNth(0, 0, [])).toBe('');
    });
    it('should return null for empty charset and positive length', () => {
      expect(generateCharsForNth(0, 1, [])).toBeNull();
    });
    it('should handle longer combinations', () => {
      const charSetNum = ['0', '1'];
      expect(generateCharsForNth(0, 3, charSetNum)).toBe('000'); // 0
      expect(generateCharsForNth(1, 3, charSetNum)).toBe('001'); // 1
      expect(generateCharsForNth(7, 3, charSetNum)).toBe('111'); // 7
    });
  });

  describe('calculateMaxSldCombinations', () => {
    it('should calculate for prefix_variable', () => {
      expect(calculateMaxSldCombinations({ generationPattern: 'prefix_variable', prefixVariableLength: 2 }, 2)).toBe(4); // 2^2
    });
    it('should calculate for suffix_variable', () => {
      expect(calculateMaxSldCombinations({ generationPattern: 'suffix_variable', suffixVariableLength: 3 }, 3)).toBe(27); // 3^3
    });
    it('should calculate for both_variable', () => {
      expect(calculateMaxSldCombinations({ generationPattern: 'both_variable', prefixVariableLength: 1, suffixVariableLength: 1 }, 2)).toBe(4); // 2^1 * 2^1
    });
    it('should handle one length being 0 for both_variable', () => {
      expect(calculateMaxSldCombinations({ generationPattern: 'both_variable', prefixVariableLength: 2, suffixVariableLength: 0 }, 2)).toBe(4); // 2^2 * 2^0 = 4 * 1
    });
    it('should return 0 if uniqueCharSetSize is 0 and lengths > 0', () => {
      expect(calculateMaxSldCombinations({ generationPattern: 'prefix_variable', prefixVariableLength: 2 }, 0)).toBe(0);
    });
     it('should return 1 if uniqueCharSetSize is 0 but all lengths are 0 (constant only)', () => {
      // This case is a bit tricky as the function focuses on variable parts. 
      // A constant only "SLD" is 1 combination.
      // However, the function is primarily for variable parts.
      // If all lengths are 0, it might effectively mean 1 combination (the constant itself).
      // Let's test with the assumption that if charSetSize is 0, variable parts yield 0 combos.
      expect(calculateMaxSldCombinations({ generationPattern: 'both_variable', prefixVariableLength: 0, suffixVariableLength: 0 }, 0)).toBe(1);
      // The calling context (domainFromIndex) will handle if there are no variable parts and just constantPart.
    });
  });

  describe('domainFromIndex', () => {
    const configBase: DomainGenerationConfig = {
      generationPattern: 'prefix_variable',
      constantPart: 'test',
      allowedCharSet: 'ab',
      tlds: ['.com'],
      prefixVariableLength: 2,
    };

    it('should generate domain for prefix_variable', () => {
      expect(domainFromIndex(0, configBase, '.com')).toBe('aatest.com'); // aa + test + .com
      expect(domainFromIndex(1, configBase, '.com')).toBe('abtest.com'); // ab + test + .com
      expect(domainFromIndex(3, configBase, '.com')).toBe('bbtest.com'); // bb + test + .com
    });

    it('should generate domain for suffix_variable', () => {
      const config: DomainGenerationConfig = {
        ...configBase,
        generationPattern: 'suffix_variable',
        prefixVariableLength: 0,
        suffixVariableLength: 1,
      };
      expect(domainFromIndex(0, config, '.com')).toBe('testa.com'); // test + a + .com
      expect(domainFromIndex(1, config, '.com')).toBe('testb.com'); // test + b + .com
    });

    it('should generate domain for both_variable', () => {
      const config: DomainGenerationConfig = {
        ...configBase,
        generationPattern: 'both_variable',
        prefixVariableLength: 1,
        suffixVariableLength: 1,
      };
      // With 1 prefix char and 1 suffix char, index calculation:
      // Index 0: prefix 'a', suffix 'a' -> a + test + a
      expect(domainFromIndex(0, config, '.com')).toBe('atesta.com');
      // Index 1: prefix 'a', suffix 'b' -> a + test + b  
      expect(domainFromIndex(1, config, '.com')).toBe('atestb.com');
      // Index 2: prefix 'b', suffix 'a' -> b + test + a
      expect(domainFromIndex(2, config, '.com')).toBe('btesta.com');
      // Index 3: prefix 'b', suffix 'b' -> b + test + b
      expect(domainFromIndex(3, config, '.com')).toBe('btestb.com');
    });

    it('should handle TLD rotation', () => {
      const config: DomainGenerationConfig = {
        ...configBase,
        tlds: ['.com', '.net'],
        prefixVariableLength: 1,
      };
      // Note: TLD rotation logic might need to be handled at a higher level
      // Testing individual domain generation for specific TLDs
      expect(domainFromIndex(0, config, '.com')).toBe('atest.com');
      expect(domainFromIndex(0, config, '.net')).toBe('atest.net');
      expect(domainFromIndex(1, config, '.com')).toBe('btest.com');
      expect(domainFromIndex(1, config, '.net')).toBe('btest.net');
    });

    it('should generate correctly when prefix or suffix length is 0 for both_variable', () => {
       const config1: DomainGenerationConfig = {
        generationPattern: 'both_variable',
        constantPart: 'test',
        allowedCharSet: 'ab',
        tlds: ['.com'],
        prefixVariableLength: 0,
        suffixVariableLength: 1, // Only suffix varies
      };
      expect(domainFromIndex(0, config1, '.com')).toBe('testa.com');
      expect(domainFromIndex(1, config1, '.com')).toBe('testb.com');

      const config2: DomainGenerationConfig = {
        generationPattern: 'both_variable',
        constantPart: 'test',
        allowedCharSet: 'ab',
        tlds: ['.com'],
        prefixVariableLength: 1, // Only prefix varies
        suffixVariableLength: 0,
      };
      expect(domainFromIndex(0, config2, '.com')).toBe('atest.com');
      expect(domainFromIndex(1, config2, '.com')).toBe('btest.com');
    });
  });
});
