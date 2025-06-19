/**
 * BigInt input component for safely handling large integer input without precision loss
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { SafeBigInt } from '@/lib/types/branded';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface BigIntInputProps {
  value?: SafeBigInt | string | number | bigint | null;
  onChange?: (value: SafeBigInt | undefined) => void;
  onValueChange?: (value: string) => void; // Raw string value
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
  min?: SafeBigInt | string | number | bigint;
  max?: SafeBigInt | string | number | bigint;
  step?: number;
  allowNegative?: boolean;
  showValidationError?: boolean;
  validationErrorMessage?: string;
  autoFocus?: boolean;
  name?: string;
  id?: string;
  'data-testid'?: string;
}

/**
 * Converts various types to a string representation for input display
 */
function valueToString(value: SafeBigInt | string | number | bigint | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    // Remove any non-digit characters except minus sign at the start
    const cleaned = value.replace(/^(-)?[^\d]*/, '$1').replace(/[^\d]/g, '');
    return cleaned;
  }

  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      console.warn('Unsafe number conversion in BigIntInput:', value);
    }
    return Math.floor(value).toString();
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  // Assume SafeBigInt type
  return String(value);
}

/**
 * Validates if a string represents a valid integer
 */
function isValidInteger(value: string, allowNegative: boolean = false): boolean {
  if (!value) return true; // Empty is valid
  
  const pattern = allowNegative ? /^-?\d+$/ : /^\d+$/;
  return pattern.test(value);
}

/**
 * Converts string to SafeBigInt if valid
 */
function stringToSafeBigInt(value: string): SafeBigInt | undefined {
  if (!value) return undefined;
  
  try {
    const bigIntValue = BigInt(value);
    return bigIntValue as SafeBigInt;
  } catch {
    return undefined;
  }
}

/**
 * Checks if a value is within specified bounds
 */
function isWithinBounds(
  value: bigint,
  min?: SafeBigInt | string | number | bigint,
  max?: SafeBigInt | string | number | bigint
): boolean {
  if (min !== undefined) {
    const minBig = typeof min === 'bigint' ? min : BigInt(String(min));
    if (value < minBig) return false;
  }
  
  if (max !== undefined) {
    const maxBig = typeof max === 'bigint' ? max : BigInt(String(max));
    if (value > maxBig) return false;
  }
  
  return true;
}

/**
 * BigInt input component with validation and bounds checking
 */
export function BigIntInput({
  value,
  onChange,
  onValueChange,
  placeholder = 'Enter a number',
  disabled = false,
  readOnly = false,
  className,
  min,
  max,
  step = 1,
  allowNegative = false,
  showValidationError = true,
  validationErrorMessage,
  autoFocus = false,
  name,
  id,
  'data-testid': dataTestId,
  ...props
}: BigIntInputProps) {
  const [stringValue, setStringValue] = useState(() => valueToString(value));
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Update string value when prop value changes
  useEffect(() => {
    const newStringValue = valueToString(value);
    if (newStringValue !== stringValue) {
      setStringValue(newStringValue);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]); // Don't include stringValue to avoid loops

  // Validation
  const { isValid, error } = useMemo(() => {
    if (!stringValue) {
      return { isValid: true, error: null };
    }

    if (!isValidInteger(stringValue, allowNegative)) {
      return { 
        isValid: false, 
        error: allowNegative ? 'Must be a valid integer' : 'Must be a valid positive integer'
      };
    }

    try {
      const bigIntValue = BigInt(stringValue);
      
      if (!isWithinBounds(bigIntValue, min, max)) {
        let boundsError = 'Value is out of range';
        if (min !== undefined && max !== undefined) {
          boundsError = `Value must be between ${String(min)} and ${String(max)}`;
        } else if (min !== undefined) {
          boundsError = `Value must be at least ${String(min)}`;
        } else if (max !== undefined) {
          boundsError = `Value must be at most ${String(max)}`;
        }
        return { isValid: false, error: boundsError };
      }

      return { isValid: true, error: null };
    } catch {
      return { isValid: false, error: 'Invalid number format' };
    }
  }, [stringValue, allowNegative, min, max]);

  // Update error state
  useEffect(() => {
    setHasError(!isValid);
    setErrorMessage(error);
  }, [isValid, error]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    
    // Allow empty value
    if (!newValue) {
      setStringValue('');
      onChange?.(undefined);
      onValueChange?.('');
      return;
    }

    // Basic input filtering - only allow digits and minus sign at start
    const pattern = allowNegative ? /^-?\d*$/ : /^\d*$/;
    if (!pattern.test(newValue)) {
      return; // Reject invalid characters
    }

    setStringValue(newValue);
    onValueChange?.(newValue);

    // Convert to SafeBigInt if valid
    if (isValidInteger(newValue, allowNegative)) {
      const safeBigInt = stringToSafeBigInt(newValue);
      onChange?.(safeBigInt);
    }
  }, [allowNegative, onChange, onValueChange]);

  const handleBlur = useCallback(() => {
    // Clean up the value on blur
    if (stringValue && isValidInteger(stringValue, allowNegative)) {
      try {
        const bigIntValue = BigInt(stringValue);
        const cleanedValue = bigIntValue.toString();
        if (cleanedValue !== stringValue) {
          setStringValue(cleanedValue);
          onValueChange?.(cleanedValue);
        }
      } catch {
        // Keep original value if conversion fails
      }
    }
  }, [stringValue, allowNegative, onValueChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    // Handle increment/decrement with arrow keys
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      
      const currentBigInt = stringToSafeBigInt(stringValue) || BigInt(0);
      const stepBig = BigInt(step);
      const newValue = e.key === 'ArrowUp' 
        ? currentBigInt + stepBig 
        : currentBigInt - stepBig;

      if (isWithinBounds(newValue, min, max)) {
        const newStringValue = newValue.toString();
        setStringValue(newStringValue);
        onChange?.(newValue as SafeBigInt);
        onValueChange?.(newStringValue);
      }
    }
  }, [stringValue, step, min, max, onChange, onValueChange]);

  return (
    <div className="space-y-1">
      <Input
        type="text"
        inputMode="numeric"
        pattern={allowNegative ? "^-?\\d*$" : "^\\d*$"}
        value={stringValue}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        className={cn(
          'font-mono',
          hasError && showValidationError && 'border-destructive focus-visible:ring-destructive',
          className
        )}
        autoFocus={autoFocus}
        name={name}
        id={id}
        data-testid={dataTestId}
        {...props}
      />
      
      {hasError && showValidationError && errorMessage && (
        <p className="text-sm text-destructive">
          {validationErrorMessage || errorMessage}
        </p>
      )}
    </div>
  );
}

/**
 * Specialized BigInt input for item counts (always positive)
 */
export function ItemCountInput({ 
  value, 
  onChange, 
  placeholder = "Enter count",
  min = 0,
  ...props 
}: Omit<BigIntInputProps, 'allowNegative' | 'min'> & { min?: number | string | bigint }) {
  return (
    <BigIntInput
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      allowNegative={false}
      min={min}
      {...props}
    />
  );
}

/**
 * Specialized BigInt input for byte sizes
 */
export function ByteSizeInput({ 
  value, 
  onChange, 
  placeholder = "Enter size in bytes",
  min = 0,
  ...props 
}: Omit<BigIntInputProps, 'allowNegative' | 'min'> & { min?: number | string | bigint }) {
  return (
    <BigIntInput
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      allowNegative={false}
      min={min}
      {...props}
    />
  );
}
