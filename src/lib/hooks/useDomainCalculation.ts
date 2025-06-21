import { useMemo, useCallback } from 'react';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { CampaignSelectedType, DomainGenerationPattern } from '@/lib/types';

/**
 * Performance-optimized hook for domain calculation with safeguards
 * Implements debouncing and safe computation limits to prevent UI blocking
 */
export function useDomainCalculation(
  selectedCampaignType: CampaignSelectedType | undefined,
  generationPattern: DomainGenerationPattern | undefined,
  allowedCharSet: string | undefined,
  prefixVariableLength: number | undefined,
  suffixVariableLength: number | undefined,
  tldsInput: string | undefined
) {
  // Debounce inputs to prevent excessive calculations during typing
  const debouncedGenerationPattern = useDebounce(generationPattern, 300);
  const debouncedCharSet = useDebounce(allowedCharSet, 300);
  const debouncedPrefixLength = useDebounce(prefixVariableLength, 300);
  const debouncedSuffixLength = useDebounce(suffixVariableLength, 300);
  const debouncedTldsInput = useDebounce(tldsInput, 300);

  // Performance safeguards
  const MAX_SAFE_COMBINATIONS = 10_000_000; // 10M combinations max
  const MAX_SAFE_CHAR_SET_LENGTH = 100;
  const MAX_SAFE_VARIABLE_LENGTH = 10;

  const calculateDomainTotal = useCallback((
    campaignType: CampaignSelectedType | undefined,
    pattern: DomainGenerationPattern | undefined,
    charSet: string | undefined,
    prefixLen: number | undefined,
    suffixLen: number | undefined,
    tlds: string | undefined
  ) => {
    // Early return for non-domain-generation campaigns
    if (campaignType !== 'domain_generation') {
      return { total: 0, isSafe: true, warning: null };
    }

    const safeCharSet = charSet || "abcdefghijklmnopqrstuvwxyz0123456789";
    const charSetLength = safeCharSet.length;
    const tldList = (tlds || ".com").split(',').map(tld => tld.trim()).filter(tld => tld.length > 0);
    const tldCount = tldList.length;

    // Input validation
    if (charSetLength === 0 || tldCount === 0) {
      return { total: 0, isSafe: true, warning: null };
    }

    // Performance safeguards
    if (charSetLength > MAX_SAFE_CHAR_SET_LENGTH) {
      return { 
        total: 0, 
        isSafe: false, 
        warning: `Character set too large (${charSetLength} > ${MAX_SAFE_CHAR_SET_LENGTH}). Please reduce character set size.` 
      };
    }

    let combinations = 1;
    let warning: string | null = null;

    try {
      switch (pattern) {
        case 'prefix_variable': {
          const prefixLength = Math.max(1, Number(prefixLen) || 1);
          if (prefixLength > MAX_SAFE_VARIABLE_LENGTH) {
            return { 
              total: 0, 
              isSafe: false, 
              warning: `Prefix length too large (${prefixLength} > ${MAX_SAFE_VARIABLE_LENGTH}). Please reduce variable length.` 
            };
          }
          combinations = Math.pow(charSetLength, prefixLength);
          break;
        }
        case 'suffix_variable': {
          const suffixLength = Math.max(1, Number(suffixLen) || 1);
          if (suffixLength > MAX_SAFE_VARIABLE_LENGTH) {
            return { 
              total: 0, 
              isSafe: false, 
              warning: `Suffix length too large (${suffixLength} > ${MAX_SAFE_VARIABLE_LENGTH}). Please reduce variable length.` 
            };
          }
          combinations = Math.pow(charSetLength, suffixLength);
          break;
        }
        case 'both_variable': {
          const prefixLength = Math.max(1, Number(prefixLen) || 1);
          const suffixLength = Math.max(1, Number(suffixLen) || 1);
          const totalLength = prefixLength + suffixLength;
          if (totalLength > MAX_SAFE_VARIABLE_LENGTH) {
            return { 
              total: 0, 
              isSafe: false, 
              warning: `Combined variable length too large (${totalLength} > ${MAX_SAFE_VARIABLE_LENGTH}). Please reduce total variable length.` 
            };
          }
          combinations = Math.pow(charSetLength, totalLength);
          break;
        }
        default:
          // Default to prefix_variable with length 1
          combinations = Math.pow(charSetLength, 1);
      }

      // Check if total combinations exceed safe limits
      const total = combinations * tldCount;
      if (total > MAX_SAFE_COMBINATIONS) {
        warning = `Very large domain set (${total.toLocaleString()} combinations). Consider reducing parameters for better performance.`;
      }

      return { 
        total, 
        isSafe: total <= MAX_SAFE_COMBINATIONS, 
        warning,
        details: {
          pattern: pattern || 'prefix_variable',
          charSetLength,
          prefixLength: pattern === 'prefix_variable' || pattern === 'both_variable' ? Math.max(1, Number(prefixLen) || 1) : 0,
          suffixLength: pattern === 'suffix_variable' || pattern === 'both_variable' ? Math.max(1, Number(suffixLen) || 1) : 0,
          tldCount,
          combinations
        }
      };
    } catch {
      console.error('[useDomainCalculation] Calculation error:', error);
      return { 
        total: 0, 
        isSafe: false, 
        warning: 'Error calculating domain combinations. Please check your inputs.' 
      };
    }
  }, []);

  // Memoized calculation with debounced inputs
  const domainCalculation = useMemo(() => {
    return calculateDomainTotal(
      selectedCampaignType,
      debouncedGenerationPattern,
      debouncedCharSet,
      debouncedPrefixLength,
      debouncedSuffixLength,
      debouncedTldsInput
    );
  }, [
    selectedCampaignType,
    debouncedGenerationPattern,
    debouncedCharSet,
    debouncedPrefixLength,
    debouncedSuffixLength,
    debouncedTldsInput,
    calculateDomainTotal
  ]);

  return domainCalculation;
}