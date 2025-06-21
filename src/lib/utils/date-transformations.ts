/**
 * Date/Time Transformation Utilities
 * Handles timezone-aware date transformations between backend and frontend
 */

import { ISODateString, createISODateString } from '@/lib/types/branded';
import { logger } from '@/lib/utils/logger';

/**
 * Timezone constants
 */
export const TIMEZONES = {
  UTC: 'UTC',
  LOCAL: Intl.DateTimeFormat().resolvedOptions().timeZone,
} as const;

/**
 * Date format options for consistent display
 */
export const DATE_FORMATS = {
  SHORT: {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  } as const,
  LONG: {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  } as const,
  TIME_ONLY: {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  } as const,
  ISO: 'ISO' as const,
} as const;

/**
 * Convert backend timestamp to ISO string with validation
 * Backend sends timestamps in ISO 8601 format
 */
export function transformBackendTimestamp(
  timestamp: unknown
): ISODateString | undefined {
  if (!timestamp) return undefined;
  
  try {
    // Handle various timestamp formats
    let date: Date;
    
    if (typeof timestamp === 'string') {
      // Already an ISO string or parseable date string
      date = new Date(timestamp);
    } else if (typeof timestamp === 'number') {
      // Unix timestamp (seconds or milliseconds)
      // If the number is too small, assume it's in seconds
      date = new Date(timestamp < 10000000000 ? timestamp * 1000 : timestamp);
    } else if (timestamp instanceof Date) {
      date = timestamp;
    } else {
      logger.warn('Invalid timestamp format provided', {
        component: 'DateTransformations',
        timestamp,
        action: 'transformBackendTimestamp'
      });
      return undefined;
    }
    
    // Validate the date
    if (isNaN(date.getTime())) {
      logger.warn('Invalid date created from timestamp', {
        component: 'DateTransformations',
        timestamp,
        action: 'transformBackendTimestamp'
      });
      return undefined;
    }
    
    return createISODateString(date.toISOString());
  } catch (error: unknown) {
    logger.error('Error transforming timestamp', {
      component: 'DateTransformations',
      error,
      timestamp,
      action: 'transformBackendTimestamp'
    });
    return undefined;
  }
}

/**
 * Format ISO date string for display with timezone handling
 */
export function formatISODate(
  isoDate: ISODateString | undefined,
  format: keyof typeof DATE_FORMATS = 'SHORT',
  timezone: string = TIMEZONES.LOCAL
): string {
  if (!isoDate) return '';
  
  try {
    const date = new Date(isoDate);
    
    if (format === 'ISO') {
      return isoDate;
    }
    
    const options = {
      ...DATE_FORMATS[format],
      timeZone: timezone,
    };
    
    return new Intl.DateTimeFormat('en-US', options).format(date);
  } catch (error: unknown) {
    logger.error('Error formatting date', {
      component: 'DateTransformations',
      error,
      isoDate,
      format,
      timezone,
      action: 'formatISODate'
    });
    return isoDate; // Fallback to raw ISO string
  }
}

/**
 * Get relative time string (e.g., "2 hours ago", "in 3 days")
 */
export function getRelativeTime(
  isoDate: ISODateString | undefined
): string {
  if (!isoDate) return '';
  
  try {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    
    if (Math.abs(diffDays) > 0) {
      return rtf.format(-diffDays, 'day');
    } else if (Math.abs(diffHours) > 0) {
      return rtf.format(-diffHours, 'hour');
    } else if (Math.abs(diffMinutes) > 0) {
      return rtf.format(-diffMinutes, 'minute');
    } else {
      return rtf.format(-diffSeconds, 'second');
    }
  } catch (error: unknown) {
    logger.error('Error getting relative time', {
      component: 'DateTransformations',
      error,
      isoDate,
      action: 'getRelativeTime'
    });
    return formatISODate(isoDate);
  }
}

/**
 * Convert local date input to UTC ISO string for backend
 */
export function toUTCISOString(
  date: Date | string | undefined
): ISODateString | undefined {
  if (!date) return undefined;
  
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) {
      return undefined;
    }
    return createISODateString(dateObj.toISOString());
  } catch (error: unknown) {
    logger.error('Error converting to UTC ISO string', {
      component: 'DateTransformations',
      error,
      date,
      action: 'toUTCISOString'
    });
    return undefined;
  }
}

/**
 * Parse ISO string to Date object with validation
 */
export function parseISODate(
  isoDate: ISODateString | undefined
): Date | undefined {
  if (!isoDate) return undefined;
  
  try {
    const date = new Date(isoDate);
    if (isNaN(date.getTime())) {
      return undefined;
    }
    return date;
  } catch (error: unknown) {
    logger.error('Error parsing ISO date', {
      component: 'DateTransformations',
      error,
      isoDate,
      action: 'parseISODate'
    });
    return undefined;
  }
}

/**
 * Check if a date is within a specific range
 */
export function isDateInRange(
  date: ISODateString | undefined,
  startDate: ISODateString | undefined,
  endDate: ISODateString | undefined
): boolean {
  if (!date) return false;
  
  const d = parseISODate(date);
  if (!d) return false;
  
  const start = startDate ? parseISODate(startDate) : undefined;
  const end = endDate ? parseISODate(endDate) : undefined;
  
  if (start && d < start) return false;
  if (end && d > end) return false;
  
  return true;
}

/**
 * Add time to an ISO date string
 */
export function addTime(
  isoDate: ISODateString,
  amount: number,
  unit: 'seconds' | 'minutes' | 'hours' | 'days'
): ISODateString {
  const date = new Date(isoDate);
  
  switch (unit) {
    case 'seconds':
      date.setSeconds(date.getSeconds() + amount);
      break;
    case 'minutes':
      date.setMinutes(date.getMinutes() + amount);
      break;
    case 'hours':
      date.setHours(date.getHours() + amount);
      break;
    case 'days':
      date.setDate(date.getDate() + amount);
      break;
  }
  
  return createISODateString(date.toISOString());
}

/**
 * Calculate duration between two dates
 */
export function calculateDuration(
  startDate: ISODateString | undefined,
  endDate: ISODateString | undefined
): { days: number; hours: number; minutes: number; seconds: number } | undefined {
  if (!startDate || !endDate) return undefined;
  
  const start = parseISODate(startDate);
  const end = parseISODate(endDate);
  
  if (!start || !end) return undefined;
  
  const diffMs = Math.abs(end.getTime() - start.getTime());
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  return {
    days: diffDays,
    hours: diffHours % 24,
    minutes: diffMinutes % 60,
    seconds: diffSeconds % 60,
  };
}

/**
 * Format duration for display
 */
export function formatDuration(
  duration: { days: number; hours: number; minutes: number; seconds: number } | undefined
): string {
  if (!duration) return '';
  
  const parts: string[] = [];
  
  if (duration.days > 0) {
    parts.push(`${duration.days}d`);
  }
  if (duration.hours > 0) {
    parts.push(`${duration.hours}h`);
  }
  if (duration.minutes > 0) {
    parts.push(`${duration.minutes}m`);
  }
  if (duration.seconds > 0 || parts.length === 0) {
    parts.push(`${duration.seconds}s`);
  }
  
  return parts.join(' ');
}

/**
 * Batch transform date fields in an object
 */
export function transformDateFields<T extends Record<string, unknown>>(
  obj: T,
  dateFields: (keyof T)[]
): T {
  const result = { ...obj };
  
  for (const field of dateFields) {
    const value = obj[field];
    if (value !== null && value !== undefined) {
      const transformed = transformBackendTimestamp(value);
      if (transformed) {
        result[field] = transformed as T[keyof T];
      }
    }
  }
  
  return result;
}