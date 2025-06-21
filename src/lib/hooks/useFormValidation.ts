// src/lib/hooks/useFormValidation.ts
// Enhanced form validation utilities with branded types integration

import { useState, useCallback } from 'react';
import { z } from 'zod';
import { UseFormSetError, FieldPath, FieldValues } from 'react-hook-form';
import {
  validateAndTransformFormData,
  extractBrandedTypeErrors
} from '@/lib/schemas/brandedValidationSchemas';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/utils/logger';

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: Record<string, string>;
}

export interface FormValidationOptions {
  showToastOnError?: boolean;
  toastTitle?: string;
}

/**
 * Enhanced form validation hook with branded types support
 */
export function useFormValidation<TFormData extends FieldValues>(
  setError?: UseFormSetError<TFormData>,
  options: FormValidationOptions = {}
) {
  const { toast } = useToast();
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isValidating, setIsValidating] = useState(false);

  const {
    showToastOnError = true,
    toastTitle = "Validation Error"
  } = options;

  /**
   * Validate form data against a schema with branded types
   */
  const validateWithSchema = useCallback(<T>(
    data: Record<string, unknown>,
    schema: z.ZodSchema<T>
  ): ValidationResult<T> => {
    setIsValidating(true);
    
    try {
      const result = validateAndTransformFormData(data, schema);
      
      if (result.success) {
        setValidationErrors({});
        setIsValidating(false);
        return { success: true, data: result.data as T };
      } else {
        const errors = extractBrandedTypeErrors(result.errors);
        setValidationErrors(errors);
        
        // Set form errors if setError function is provided
        if (setError) {
          Object.entries(errors).forEach(([field, message]) => {
            setError(field as FieldPath<TFormData>, {
              type: 'manual',
              message
            });
          });
        }
        
        // Show toast if enabled
        if (showToastOnError) {
          toast({
            title: toastTitle,
            description: Object.values(errors)[0] || "Please check your form data",
            variant: "destructive"
          });
        }
        
        setIsValidating(false);
        return { success: false, errors };
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Validation failed";
      setValidationErrors({ general: errorMessage });
      
      if (showToastOnError) {
        toast({
          title: toastTitle,
          description: errorMessage,
          variant: "destructive"
        });
      }
      
      setIsValidating(false);
      return { success: false, errors: { general: errorMessage } };
    }
  }, [setError, showToastOnError, toastTitle, toast]);

  /**
   * Clear all validation errors
   */
  const clearValidationErrors = useCallback(() => {
    setValidationErrors({});
  }, []);

  /**
   * Set specific field error
   */
  const setFieldError = useCallback((field: string, message: string) => {
    setValidationErrors(prev => ({ ...prev, [field]: message }));
    
    if (setError) {
      setError(field as FieldPath<TFormData>, {
        type: 'manual',
        message
      });
    }
  }, [setError]);

  /**
   * Validate UUID field specifically
   */
  const validateUUID = useCallback((value: string, fieldName: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    
    if (value && !uuidRegex.test(value)) {
      setFieldError(fieldName, `Invalid ${fieldName} format`);
      return false;
    }
    
    return true;
  }, [setFieldError]);

  /**
   * Validate email field
   */
  const validateEmail = useCallback((value: string, fieldName = 'email'): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (value && !emailRegex.test(value)) {
      setFieldError(fieldName, "Invalid email format");
      return false;
    }
    
    return true;
  }, [setFieldError]);

  /**
   * Validate required field
   */
  const validateRequired = useCallback((value: unknown, fieldName: string): boolean => {
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      setFieldError(fieldName, `${fieldName} is required`);
      return false;
    }
    
    return true;
  }, [setFieldError]);

  return {
    validateWithSchema,
    clearValidationErrors,
    setFieldError,
    validateUUID,
    validateEmail,
    validateRequired,
    validationErrors,
    isValidating
  };
}

/**
 * Type-safe form submission handler with branded types
 */
export function useTypeSafeFormSubmit<TFormData extends FieldValues, TTransformed>(
  onSubmit: (data: TTransformed) => Promise<void> | void,
  schema: z.ZodSchema<TTransformed>,
  setError?: UseFormSetError<TFormData>
) {
  const { validateWithSchema } = useFormValidation(setError);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async (data: TFormData) => {
    setIsSubmitting(true);
    
    try {
      const validation = validateWithSchema(data as Record<string, unknown>, schema);
      
      if (validation.success && validation.data) {
        await onSubmit(validation.data as TTransformed);
      }
    } catch (error: unknown) {
      logger.error('Form submission error occurred', {
        component: 'useTypeSafeFormSubmit',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [validateWithSchema, onSubmit, schema]);

  return {
    handleSubmit,
    isSubmitting
  };
}
