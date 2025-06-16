// src/lib/utils/domainCalculation.ts
// Production domain calculation utilities
// Replaces mock logic with real calculation

import type { DomainGenerationConfig } from '@/lib/types';

/**
 * Calculate maximum theoretical domains for a given configuration
 */
export function calculateMaxTheoreticalDomains(config: DomainGenerationConfig): number {
  if (!config) return 0;

  const { generationPattern, allowedCharSet, prefixVariableLength, suffixVariableLength } = config;
  const charSetLength = allowedCharSet?.length || 26;

  switch (generationPattern) {
    case 'prefix_variable':
      return prefixVariableLength ? Math.pow(charSetLength, prefixVariableLength) : 0;
    case 'suffix_variable':
      return suffixVariableLength ? Math.pow(charSetLength, suffixVariableLength) : 0;
    case 'both_variable':
      const prefixCombos = prefixVariableLength ? Math.pow(charSetLength, prefixVariableLength) : 1;
      const suffixCombos = suffixVariableLength ? Math.pow(charSetLength, suffixVariableLength) : 1;
      return prefixCombos * suffixCombos;
    default:
      return 0;
  }
}

/**
 * Calculate remaining domains in sequence for a configuration
 * This would typically check against backend state, but for now provides estimate
 */
export function calculateRemainingDomains(
  config: DomainGenerationConfig,
  currentOffset: number = 0
): number {
  const maxTheoretical = calculateMaxTheoreticalDomains(config);
  return Math.max(0, maxTheoretical - currentOffset);
}

/**
 * Validate domain generation configuration
 */
export function validateDomainConfig(config: DomainGenerationConfig): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config.constantPart?.trim()) {
    errors.push('Constant part is required');
  }

  if (!config.allowedCharSet?.trim()) {
    errors.push('Character set is required');
  }

  if (config.generationPattern === 'prefix_variable' && (!config.prefixVariableLength || config.prefixVariableLength < 1)) {
    errors.push('Prefix variable length must be at least 1');
  }

  if (config.generationPattern === 'suffix_variable' && (!config.suffixVariableLength || config.suffixVariableLength < 1)) {
    errors.push('Suffix variable length must be at least 1');
  }

  if (config.generationPattern === 'both_variable') {
    if (!config.prefixVariableLength || config.prefixVariableLength < 1) {
      errors.push('Prefix variable length must be at least 1 for both variable pattern');
    }
    if (!config.suffixVariableLength || config.suffixVariableLength < 1) {
      errors.push('Suffix variable length must be at least 1 for both variable pattern');
    }
  }

  if (!config.tlds?.length) {
    errors.push('At least one TLD is required');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
