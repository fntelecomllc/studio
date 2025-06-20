/**
 * Enum Helper Utilities
 * Provides type-safe enum operations and validation
 */

import {
  ModelsCampaignTypeEnum,
  ModelsCampaignStatusEnum,
  ModelsPersonaTypeEnum,
  ModelsProxyProtocolEnum,
  ModelsKeywordRuleTypeEnum
} from '@/lib/types/models-aligned';

/**
 * Type-safe enum checker
 */
export function isEnumValue<T extends Record<string, string>>(
  value: unknown,
  enumObj: T
): value is T[keyof T] {
  return typeof value === 'string' && Object.values(enumObj).includes(value);
}

/**
 * Get enum keys with type safety
 */
export function getEnumKeys<T extends Record<string, string>>(
  enumObj: T
): (keyof T)[] {
  return Object.keys(enumObj) as (keyof T)[];
}

/**
 * Get enum values with type safety
 */
export function getEnumValues<T extends Record<string, string>>(
  enumObj: T
): T[keyof T][] {
  return Object.values(enumObj) as T[keyof T][];
}

/**
 * Campaign type helpers
 */
export const CampaignTypeHelpers = {
  isValid: (value: unknown): value is ModelsCampaignTypeEnum => 
    isEnumValue(value, ModelsCampaignTypeEnum),
  
  getDisplayName: (type: ModelsCampaignTypeEnum): string => {
    switch (type) {
      case ModelsCampaignTypeEnum.DomainGeneration:
        return 'Domain Generation';
      case ModelsCampaignTypeEnum.DnsValidation:
        return 'DNS Validation';
      case ModelsCampaignTypeEnum.HttpKeywordValidation:
        return 'HTTP Keyword Validation';
      default:
        return exhaustiveCheck(type);
    }
  },
  
  getShortName: (type: ModelsCampaignTypeEnum): string => {
    switch (type) {
      case ModelsCampaignTypeEnum.DomainGeneration:
        return 'Gen';
      case ModelsCampaignTypeEnum.DnsValidation:
        return 'DNS';
      case ModelsCampaignTypeEnum.HttpKeywordValidation:
        return 'HTTP';
      default:
        return exhaustiveCheck(type);
    }
  },
  
  getIcon: (type: ModelsCampaignTypeEnum): string => {
    switch (type) {
      case ModelsCampaignTypeEnum.DomainGeneration:
        return '🔧';
      case ModelsCampaignTypeEnum.DnsValidation:
        return '🔍';
      case ModelsCampaignTypeEnum.HttpKeywordValidation:
        return '🌐';
      default:
        return exhaustiveCheck(type);
    }
  }
} as const;

/**
 * Campaign status helpers
 */
export const CampaignStatusHelpers = {
  isValid: (value: unknown): value is ModelsCampaignStatusEnum => 
    isEnumValue(value, ModelsCampaignStatusEnum),
  
  isActive: (status: ModelsCampaignStatusEnum): boolean => {
    switch (status) {
      case ModelsCampaignStatusEnum.Running:
      case ModelsCampaignStatusEnum.Pausing:
        return true;
      default:
        return false;
    }
  },
  
  isTerminal: (status: ModelsCampaignStatusEnum): boolean => {
    switch (status) {
      case ModelsCampaignStatusEnum.Completed:
      case ModelsCampaignStatusEnum.Failed:
      case ModelsCampaignStatusEnum.Cancelled:
        return true;
      default:
        return false;
    }
  },
  
  canStart: (status: ModelsCampaignStatusEnum): boolean => {
    switch (status) {
      case ModelsCampaignStatusEnum.Pending:
      case ModelsCampaignStatusEnum.Queued:
        return true;
      default:
        return false;
    }
  },
  
  canPause: (status: ModelsCampaignStatusEnum): boolean => {
    return status === ModelsCampaignStatusEnum.Running;
  },
  
  canResume: (status: ModelsCampaignStatusEnum): boolean => {
    return status === ModelsCampaignStatusEnum.Paused;
  },
  
  canCancel: (status: ModelsCampaignStatusEnum): boolean => {
    switch (status) {
      case ModelsCampaignStatusEnum.Pending:
      case ModelsCampaignStatusEnum.Queued:
      case ModelsCampaignStatusEnum.Running:
      case ModelsCampaignStatusEnum.Paused:
      case ModelsCampaignStatusEnum.Pausing:
        return true;
      default:
        return false;
    }
  },
  
  getDisplayName: (status: ModelsCampaignStatusEnum): string => {
    switch (status) {
      case ModelsCampaignStatusEnum.Pending:
        return 'Pending';
      case ModelsCampaignStatusEnum.Queued:
        return 'Queued';
      case ModelsCampaignStatusEnum.Running:
        return 'Running';
      case ModelsCampaignStatusEnum.Pausing:
        return 'Pausing';
      case ModelsCampaignStatusEnum.Paused:
        return 'Paused';
      case ModelsCampaignStatusEnum.Completed:
        return 'Completed';
      case ModelsCampaignStatusEnum.Failed:
        return 'Failed';
      case ModelsCampaignStatusEnum.Cancelled:
        return 'Cancelled';
      default:
        return exhaustiveCheck(status);
    }
  },
  
  getColor: (status: ModelsCampaignStatusEnum): string => {
    switch (status) {
      case ModelsCampaignStatusEnum.Pending:
      case ModelsCampaignStatusEnum.Queued:
        return 'gray';
      case ModelsCampaignStatusEnum.Running:
        return 'blue';
      case ModelsCampaignStatusEnum.Pausing:
        return 'orange';
      case ModelsCampaignStatusEnum.Paused:
        return 'yellow';
      case ModelsCampaignStatusEnum.Completed:
        return 'green';
      case ModelsCampaignStatusEnum.Failed:
        return 'red';
      case ModelsCampaignStatusEnum.Cancelled:
        return 'gray';
      default:
        return exhaustiveCheck(status);
    }
  }
} as const;

/**
 * Persona type helpers
 */
export const PersonaTypeHelpers = {
  isValid: (value: unknown): value is ModelsPersonaTypeEnum => 
    isEnumValue(value, ModelsPersonaTypeEnum),
  
  getDisplayName: (type: ModelsPersonaTypeEnum): string => {
    switch (type) {
      case ModelsPersonaTypeEnum.Dns:
        return 'DNS Persona';
      case ModelsPersonaTypeEnum.Http:
        return 'HTTP Persona';
      default:
        return exhaustiveCheck(type);
    }
  },
  
  getIcon: (type: ModelsPersonaTypeEnum): string => {
    switch (type) {
      case ModelsPersonaTypeEnum.Dns:
        return '🔍';
      case ModelsPersonaTypeEnum.Http:
        return '🌐';
      default:
        return exhaustiveCheck(type);
    }
  }
} as const;

/**
 * Proxy protocol helpers
 */
export const ProxyProtocolHelpers = {
  isValid: (value: unknown): value is ModelsProxyProtocolEnum => 
    isEnumValue(value, ModelsProxyProtocolEnum),
  
  getDisplayName: (protocol: ModelsProxyProtocolEnum): string => {
    switch (protocol) {
      case ModelsProxyProtocolEnum.Http:
        return 'HTTP';
      case ModelsProxyProtocolEnum.Https:
        return 'HTTPS';
      case ModelsProxyProtocolEnum.Socks5:
        return 'SOCKS5';
      case ModelsProxyProtocolEnum.Socks4:
        return 'SOCKS4';
      default:
        return exhaustiveCheck(protocol);
    }
  },
  
  getDefaultPort: (protocol: ModelsProxyProtocolEnum): number => {
    switch (protocol) {
      case ModelsProxyProtocolEnum.Http:
        return 80;
      case ModelsProxyProtocolEnum.Https:
        return 443;
      case ModelsProxyProtocolEnum.Socks5:
        return 1080;
      case ModelsProxyProtocolEnum.Socks4:
        return 1080;
      default:
        return exhaustiveCheck(protocol);
    }
  },
  
  isSecure: (protocol: ModelsProxyProtocolEnum): boolean => {
    return protocol === ModelsProxyProtocolEnum.Https;
  }
} as const;

/**
 * Keyword rule type helpers
 */
export const KeywordRuleTypeHelpers = {
  isValid: (value: unknown): value is ModelsKeywordRuleTypeEnum => 
    isEnumValue(value, ModelsKeywordRuleTypeEnum),
  
  getDisplayName: (type: ModelsKeywordRuleTypeEnum): string => {
    switch (type) {
      case ModelsKeywordRuleTypeEnum.String:
        return 'Exact Match';
      case ModelsKeywordRuleTypeEnum.Regex:
        return 'Regular Expression';
      default:
        return exhaustiveCheck(type);
    }
  },
  
  getHelpText: (type: ModelsKeywordRuleTypeEnum): string => {
    switch (type) {
      case ModelsKeywordRuleTypeEnum.String:
        return 'Matches the exact string (case-sensitive option available)';
      case ModelsKeywordRuleTypeEnum.Regex:
        return 'Matches using regular expression pattern';
      default:
        return exhaustiveCheck(type);
    }
  }
} as const;

/**
 * Exhaustive check helper for switch statements
 * Ensures all enum cases are handled
 */
function exhaustiveCheck(value: never): never {
  throw new Error(`Unhandled value: ${value}`);
}

/**
 * Convert string to enum with validation
 */
export function stringToEnum<T extends Record<string, string>>(
  value: string,
  enumObj: T,
  defaultValue?: T[keyof T]
): T[keyof T] | undefined {
  if (isEnumValue(value, enumObj)) {
    return value;
  }
  return defaultValue;
}

/**
 * Batch convert strings to enums
 */
export function stringsToEnums<T extends Record<string, string>>(
  values: string[],
  enumObj: T
): T[keyof T][] {
  return values
    .map(v => stringToEnum(v, enumObj))
    .filter((v): v is T[keyof T] => v !== undefined);
}

/**
 * Export all enum objects for direct import
 */
export {
  ModelsCampaignTypeEnum,
  ModelsCampaignStatusEnum,
  ModelsPersonaTypeEnum,
  ModelsProxyProtocolEnum,
  ModelsKeywordRuleTypeEnum
} from '@/lib/types/models-aligned';