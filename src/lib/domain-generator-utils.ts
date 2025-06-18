
/**
 * @fileOverview Utility functions for deterministic domain generation.
 * This includes generating the Nth character combination and constructing a domain from an index.
 */
import type { DomainGenerationConfig } from '@/lib/types';

// Constants for SLD validation
const MAX_SLD_LENGTH = 63;
const MIN_SLD_LENGTH = 1;

/**
 * Generates a stable hash for a DomainGenerationConfig object.
 * Normalizes arrays (tlds, allowedCharSet) to ensure consistent hash for same logical config.
 * @param config The domain generation configuration.
 * @returns A string hash.
 */
export function getDomainGenerationConfigHash(config: DomainGenerationConfig): string {
  const normalizedConfig = {
    gp: config.generationPattern,
    cp: config.constantPart,
    acs: Array.from(new Set((config.allowedCharSet || '').split(''))).sort().join(''),
    tlds: [...(config.tlds || [])].sort(),
    pvl: config.prefixVariableLength || 0,
    svl: config.suffixVariableLength || 0,
    mdtg: config.maxDomainsToGenerate // This affects campaign target, not the sequence itself.
                                     // But including it ensures if user changes target, it's a "new" context for the UI progress.
                                     // If we want the sequence purely on generation params, remove mdg.
                                     // For now, keep it, as it influences `userTargetTotalDomains`.
  };
  // A more robust hash would use a crypto library, but for mock, simple stringify is okay.
  return JSON.stringify(normalizedConfig);
}

// Removed generateCharsForNth as it's backend logic now

export function calculateMaxSldCombinations(
    config: Pick<DomainGenerationConfig, 'generationPattern' | 'prefixVariableLength' | 'suffixVariableLength'>,
    uniqueCharSetSize: number
): number {
    const { generationPattern, prefixVariableLength = 0, suffixVariableLength = 0 } = config;

    if (uniqueCharSetSize === 0) {
        if (generationPattern === "prefix_variable" && prefixVariableLength > 0) return 0;
        if (generationPattern === "suffix_variable" && suffixVariableLength > 0) return 0;
        if (generationPattern === "both_variable" && (prefixVariableLength > 0 || suffixVariableLength > 0)) return 0;
        // If all variable lengths are 0, it means only the constant part for SLD (1 combination)
        return 1;
    }

    let sldCombinations = 0;
    if (generationPattern === "prefix_variable") {
        sldCombinations = prefixVariableLength > 0 ? Math.pow(uniqueCharSetSize, prefixVariableLength) : 0;
         if (prefixVariableLength === 0) sldCombinations = 1; // Only constant part
    } else if (generationPattern === "suffix_variable") {
        sldCombinations = suffixVariableLength > 0 ? Math.pow(uniqueCharSetSize, suffixVariableLength) : 0;
        if (suffixVariableLength === 0) sldCombinations = 1; // Only constant part
    } else if (generationPattern === "both_variable") {
        const pCombos = prefixVariableLength > 0 ? Math.pow(uniqueCharSetSize, prefixVariableLength) : 1;
        const sCombos = suffixVariableLength > 0 ? Math.pow(uniqueCharSetSize, suffixVariableLength) : 1;
        sldCombinations = pCombos * sCombos;
    }
    return sldCombinations;
}

// Removed domainFromIndex as it's backend logic now
// Frontend might still need to validate SLD rules visually or before submission if desired,
// but the actual generation and validation happen on the backend.
// For now, keeping SLD constants for potential future frontend validation helpers.

export function isValidSld(sld: string): boolean {
    if (sld.length < MIN_SLD_LENGTH || sld.length > MAX_SLD_LENGTH) return false;
    if (sld.startsWith('-') || sld.endsWith('-')) return false;
    if (sld.includes('--')) return false; // No consecutive hyphens in the middle
    // Valid characters: alphanumeric and hyphens (not at start/end)
    if (!/^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9]+)*$/i.test(sld) && sld.length > 0) {
        if (sld.includes(' ')) return false; // No spaces
        if (sld.replace(/-/g, "").length === 0 && sld.length > 0) return false; // Only hyphens
    }
    return true;
}

/**
 * Generate the Nth character combination for a given length and character set
 */
export function generateCharsForNth(n: number, length: number, charSet: string[]): string | null {
    if (charSet.length === 0 && length > 0) return null;
    if (length === 0) return '';
    
    const base = charSet.length;
    const maxCombinations = Math.pow(base, length);
    if (n >= maxCombinations) return null;
    
    let result = '';
    let num = n;
    
    for (let i = 0; i < length; i++) {
        result = charSet[num % base] + result;
        num = Math.floor(num / base);
    }
    
    return result;
}

/**
 * Generate a domain from an index
 */
export function domainFromIndex(index: number, config: DomainGenerationConfig, tld: string): string | null {
    const { generationPattern, constantPart, allowedCharSet, prefixVariableLength, suffixVariableLength } = config;
    const charSet = (allowedCharSet || '').split('');
    
    let sld = '';
    
    if (generationPattern === 'prefix_variable') {
        const prefixLen = prefixVariableLength || 0;
        if (prefixLen > 0) {
            const prefix = generateCharsForNth(index, prefixLen, charSet);
            if (prefix === null) return null;
            sld = prefix + (constantPart || '');
        } else {
            sld = constantPart || '';
        }
    } else if (generationPattern === 'suffix_variable') {
        const suffixLen = suffixVariableLength || 0;
        if (suffixLen > 0) {
            const suffix = generateCharsForNth(index, suffixLen, charSet);
            if (suffix === null) return null;
            sld = (constantPart || '') + suffix;
        } else {
            sld = constantPart || '';
        }
    } else if (generationPattern === 'both_variable') {
        const prefixLength = prefixVariableLength || 0;
        const suffixLength = suffixVariableLength || 0;
        
        let prefix = '';
        let suffix = '';
        
        if (prefixLength > 0) {
            const suffixCombinations = suffixLength > 0 ? Math.pow(charSet.length, suffixLength) : 1;
            const prefixIndex = Math.floor(index / suffixCombinations);
            const prefixResult = generateCharsForNth(prefixIndex, prefixLength, charSet);
            if (prefixResult === null) return null;
            prefix = prefixResult;
        }
        
        if (suffixLength > 0) {
            const suffixCombinations = Math.pow(charSet.length, suffixLength);
            const suffixIndex = index % suffixCombinations;
            const suffixResult = generateCharsForNth(suffixIndex, suffixLength, charSet);
            if (suffixResult === null) return null;
            suffix = suffixResult;
        }
        
        sld = prefix + (constantPart || '') + suffix;
    } else {
        sld = constantPart || '';
    }
    
    // Validate the SLD
    if (!isValidSld(sld)) return null;
    
    return sld + tld;
}
