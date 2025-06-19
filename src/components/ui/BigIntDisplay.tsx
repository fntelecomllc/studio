/**
 * BigInt display component for safely rendering large integers without precision loss
 */

import React, { useMemo } from 'react';
import { SafeBigInt } from '@/lib/types/branded';
import { cn } from '@/lib/utils';

interface BigIntDisplayProps {
  value: SafeBigInt | string | number | bigint | null | undefined;
  format?: 'decimal' | 'formatted' | 'abbreviated' | 'bytes';
  className?: string;
  fallback?: string;
  showTooltip?: boolean;
  precision?: number; // For abbreviated format
}

/**
 * Safely formats a SafeBigInt value for display
 */
function formatBigIntValue(
  value: SafeBigInt | string | number | bigint | null | undefined,
  format: 'decimal' | 'formatted' | 'abbreviated' | 'bytes',
  precision: number = 2
): string {
  if (value === null || value === undefined) {
    return '';
  }

  let bigIntValue: bigint;

  try {
    if (typeof value === 'bigint') {
      bigIntValue = value;
    } else if (typeof value === 'string') {
      // Handle SafeBigInt string format or numeric strings
      const cleanValue = value.replace(/[^\d]/g, '');
      if (!cleanValue) return '';
      bigIntValue = BigInt(cleanValue);
    } else if (typeof value === 'number') {
      if (!Number.isSafeInteger(value) || value < 0) {
        console.warn('Unsafe number conversion to BigInt:', value);
      }
      bigIntValue = BigInt(Math.floor(value));
    } else {
      // Assume it's already a SafeBigInt with toString method
      const strValue = String(value);
      bigIntValue = BigInt(strValue);
    }
  } catch (error) {
    console.error('Error converting value to BigInt:', value, error);
    return 'Invalid';
  }

  switch (format) {
    case 'decimal':
      return bigIntValue.toString();

    case 'formatted':
      return formatWithCommas(bigIntValue.toString());

    case 'abbreviated':
      return abbreviateNumber(bigIntValue, precision);

    case 'bytes':
      return formatBytes(bigIntValue);

    default:
      return bigIntValue.toString();
  }
}

/**
 * Add commas to a number string for readability
 */
function formatWithCommas(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Abbreviate large numbers (e.g., 1000 -> 1K, 1000000 -> 1M)
 */
function abbreviateNumber(value: bigint, precision: number): string {
  const zero = BigInt(0);
  const thousand = BigInt(1000);
  
  const absValue = value < zero ? -value : value;
  const sign = value < zero ? '-' : '';

  if (absValue < thousand) {
    return sign + absValue.toString();
  }

  const units = ['', 'K', 'M', 'B', 'T', 'P', 'E'];
  let unitIndex = 0;
  let numValue = Number(absValue);

  while (numValue >= 1000 && unitIndex < units.length - 1) {
    numValue /= 1000;
    unitIndex++;
  }

  const formatted = numValue.toFixed(precision).replace(/\\.?0+$/, '');
  return sign + formatted + units[unitIndex];
}

/**
 * Format bytes with appropriate units
 */
function formatBytes(bytes: bigint): string {
  const zero = BigInt(0);
  
  const absBytes = bytes < zero ? -bytes : bytes;
  const sign = bytes < zero ? '-' : '';

  if (absBytes === zero) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let unitIndex = 0;
  let numValue = Number(absBytes);

  while (numValue >= 1024 && unitIndex < units.length - 1) {
    numValue /= 1024;
    unitIndex++;
  }

  const formatted = unitIndex === 0 ? numValue.toString() : numValue.toFixed(2).replace(/\\.?0+$/, '');
  return sign + formatted + ' ' + units[unitIndex];
}

/**
 * BigInt display component with formatting options
 */
export function BigIntDisplay({
  value,
  format = 'decimal',
  className,
  fallback = '0',
  showTooltip = false,
  precision = 2
}: BigIntDisplayProps) {
  const displayValue = useMemo(() => {
    const formatted = formatBigIntValue(value, format, precision);
    return formatted || fallback;
  }, [value, format, precision, fallback]);

  const tooltipValue = useMemo(() => {
    if (!showTooltip || !value) return undefined;
    
    // Show raw decimal value in tooltip for abbreviated formats
    if (format === 'abbreviated' || format === 'bytes') {
      return formatBigIntValue(value, 'formatted', precision);
    }
    
    return undefined;
  }, [value, format, precision, showTooltip]);

  if (tooltipValue) {
    return (
      <span 
        className={cn('cursor-help', className)}
        title={tooltipValue}
      >
        {displayValue}
      </span>
    );
  }

  return (
    <span className={className}>
      {displayValue}
    </span>
  );
}

// Specific formatted components for common use cases

/**
 * Display for item counts (e.g., processed items, total items)
 */
export function ItemCountDisplay({ value, className }: { value: SafeBigInt | string | number | null | undefined; className?: string }) {
  return (
    <BigIntDisplay
      value={value}
      format="formatted"
      className={cn('font-mono text-sm', className)}
      showTooltip={false}
    />
  );
}

/**
 * Display for abbreviated large numbers
 */
export function AbbreviatedNumberDisplay({ 
  value, 
  className,
  precision = 1 
}: { 
  value: SafeBigInt | string | number | null | undefined; 
  className?: string;
  precision?: number;
}) {
  return (
    <BigIntDisplay
      value={value}
      format="abbreviated"
      precision={precision}
      className={cn('font-medium', className)}
      showTooltip={true}
    />
  );
}

/**
 * Display for file sizes and byte counts
 */
export function ByteSizeDisplay({ 
  value, 
  className 
}: { 
  value: SafeBigInt | string | number | null | undefined; 
  className?: string 
}) {
  return (
    <BigIntDisplay
      value={value}
      format="bytes"
      className={cn('font-mono text-sm', className)}
      showTooltip={false}
    />
  );
}

/**
 * Display for progress indicators with percentage
 */
export function ProgressCountDisplay({ 
  current, 
  total, 
  className 
}: { 
  current: SafeBigInt | string | number | null | undefined;
  total: SafeBigInt | string | number | null | undefined;
  className?: string;
}) {
  const percentage = useMemo(() => {
    if (!current || !total) return 0;
    
    try {
      const currentBig = typeof current === 'bigint' ? current : BigInt(current.toString());
      const totalBig = typeof total === 'bigint' ? total : BigInt(total.toString());
      
      const zero = BigInt(0);
      const hundred = BigInt(100);
      
      if (totalBig === zero) return 0;
      
      // Convert to number for percentage calculation
      const percent = Number((currentBig * hundred) / totalBig);
      return Math.min(100, Math.max(0, percent));
    } catch {
      return 0;
    }
  }, [current, total]);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="font-mono text-sm">
        <ItemCountDisplay value={current} /> / <ItemCountDisplay value={total} />
      </span>
      <span className="text-xs text-muted-foreground">
        ({percentage.toFixed(1)}%)
      </span>
    </div>
  );
}
