// src/components/ui/form-field-error.tsx
// Reusable form field error component for displaying validation errors

import React from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FormFieldErrorProps {
  error?: string;
  className?: string;
  showIcon?: boolean;
}

/**
 * Displays field-specific validation errors with consistent styling
 */
export function FormFieldError({ 
  error, 
  className,
  showIcon = true 
}: FormFieldErrorProps) {
  if (!error) return null;

  return (
    <div className={cn(
      'flex items-center gap-1 text-sm text-destructive',
      className
    )}>
      {showIcon && <AlertCircle className="h-4 w-4 shrink-0" />}
      <span>{error}</span>
    </div>
  );
}

interface FormFieldWrapperProps {
  children: React.ReactNode;
  error?: string;
  className?: string;
  errorClassName?: string;
}

/**
 * Wrapper component that adds error styling and display to form fields
 */
export function FormFieldWrapper({ 
  children, 
  error, 
  className,
  errorClassName 
}: FormFieldWrapperProps) {
  return (
    <div className={cn('space-y-1', className)}>
      {React.cloneElement(children as React.ReactElement, {
        className: cn(
          (children as React.ReactElement).props.className,
          error ? 'border-destructive focus:border-destructive' : ''
        )
      })}
      <FormFieldError error={error} className={errorClassName} />
    </div>
  );
}

interface FormErrorSummaryProps {
  errors: { [key: string]: string };
  mainError?: string | null;
  className?: string;
  title?: string;
}

/**
 * Displays a summary of all form errors
 */
export function FormErrorSummary({ 
  errors, 
  mainError, 
  className,
  title = 'Please correct the following errors:' 
}: FormErrorSummaryProps) {
  const fieldErrorCount = Object.keys(errors).length;
  const hasErrors = fieldErrorCount > 0 || !!mainError;
  
  if (!hasErrors) return null;

  return (
    <div className={cn(
      'rounded-md border border-destructive/50 bg-destructive/10 p-4',
      className
    )}>
      <div className="flex items-start gap-2">
        <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div className="space-y-2">
          {mainError && (
            <p className="font-medium text-destructive">{mainError}</p>
          )}
          
          {fieldErrorCount > 0 && !mainError && (
            <p className="font-medium text-destructive">{title}</p>
          )}
          
          {fieldErrorCount > 0 && (
            <ul className="space-y-1 text-sm text-destructive">
              {Object.entries(errors).map(([field, error]) => (
                <li key={field} className="flex items-start gap-1">
                  <span className="font-medium capitalize">
                    {field.replace(/([A-Z])/g, ' $1').toLowerCase()}:
                  </span>
                  <span>{error}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
