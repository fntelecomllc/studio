// src/components/auth/PasswordReset.tsx
// Password reset component with secure token validation and password reset flow
'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { 
  Loader2, 
  Eye, 
  EyeOff, 
  AlertCircle, 
  CheckCircle, 
  Mail, 
  Key, 
  ArrowLeft,
  Shield
} from 'lucide-react';
import Link from 'next/link';
import { z } from 'zod';
import type { PasswordValidationResult } from '@/lib/types';

// Forgot password validation schema
const forgotPasswordSchema = z.object({
  email: z.string()
    .email('Please enter a valid email address')
    .min(1, 'Email is required')
    .max(254, 'Email is too long')
});

// Reset password validation schema
const resetPasswordSchema = z.object({
  newPassword: z.string().min(12, 'Password must be at least 12 characters long'),
  confirmPassword: z.string().min(1, 'Please confirm your new password')
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don&apos;t match",
  path: ["confirmPassword"],
});

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;
type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

interface PasswordResetProps {
  mode?: 'forgot' | 'reset';
  token?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function PasswordReset({
  mode: initialMode,
  token: initialToken,
  onSuccess,
  onCancel
}: PasswordResetProps) {
  const { forgotPassword, resetPassword, validatePassword } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Determine mode and token from props or URL
  const tokenFromUrl = searchParams.get('token');
  const modeFromUrl = tokenFromUrl ? 'reset' : 'forgot';
  const currentMode = initialMode || modeFromUrl;
  const currentToken = initialToken || tokenFromUrl;
  
  const [forgotForm, setForgotForm] = useState<ForgotPasswordFormData>({
    email: ''
  });
  
  const [resetForm, setResetForm] = useState<ResetPasswordFormData>({
    newPassword: '',
    confirmPassword: ''
  });
  
  const [forgotErrors, setForgotErrors] = useState<Partial<Record<keyof ForgotPasswordFormData, string>>>({});
  const [resetErrors, setResetErrors] = useState<Partial<Record<keyof ResetPasswordFormData, string>>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [showPasswords, setShowPasswords] = useState({
    new: false,
    confirm: false
  });
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [passwordValidation, setPasswordValidation] = useState<PasswordValidationResult | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Resend cooldown timer
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (resendCooldown > 0) {
      timer = setTimeout(() => setResendCooldown(prev => prev - 1), 1000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [resendCooldown]);

  // Handle forgot password form input changes
  const handleForgotInputChange = useCallback((field: keyof ForgotPasswordFormData, value: string) => {
    setForgotForm(prev => ({ ...prev, [field]: value }));
    
    // Clear field error when user starts typing
    if (forgotErrors[field]) {
      setForgotErrors(prev => ({ ...prev, [field]: undefined }));
    }
    
    // Clear messages
    if (successMessage) setSuccessMessage(null);
    if (errorMessage) setErrorMessage(null);
  }, [forgotErrors, successMessage, errorMessage]);

  // Handle reset password form input changes
  const handleResetInputChange = useCallback((field: keyof ResetPasswordFormData, value: string) => {
    setResetForm(prev => ({ ...prev, [field]: value }));
    
    // Clear field error when user starts typing
    if (resetErrors[field]) {
      setResetErrors(prev => ({ ...prev, [field]: undefined }));
    }
    
    // Clear messages
    if (successMessage) setSuccessMessage(null);
    if (errorMessage) setErrorMessage(null);
    
    // Validate new password in real-time
    if (field === 'newPassword' && value) {
      validatePassword(value).then(setPasswordValidation);
    } else if (field === 'newPassword' && !value) {
      setPasswordValidation(null);
    }
  }, [resetErrors, successMessage, errorMessage, validatePassword]);

  // Toggle password visibility
  const togglePasswordVisibility = useCallback((field: keyof typeof showPasswords) => {
    setShowPasswords(prev => ({ ...prev, [field]: !prev[field] }));
  }, []);

  // Validate forgot password form
  const validateForgotForm = useCallback((): boolean => {
    try {
      forgotPasswordSchema.parse(forgotForm);
      setForgotErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Partial<Record<keyof ForgotPasswordFormData, string>> = {};
        error.errors.forEach(err => {
          if (err.path[0]) {
            fieldErrors[err.path[0] as keyof ForgotPasswordFormData] = err.message;
          }
        });
        setForgotErrors(fieldErrors);
      }
      return false;
    }
  }, [forgotForm]);

  // Validate reset password form
  const validateResetForm = useCallback((): boolean => {
    try {
      resetPasswordSchema.parse(resetForm);
      setResetErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Partial<Record<keyof ResetPasswordFormData, string>> = {};
        error.errors.forEach(err => {
          if (err.path[0]) {
            fieldErrors[err.path[0] as keyof ResetPasswordFormData] = err.message;
          }
        });
        setResetErrors(fieldErrors);
      }
      return false;
    }
  }, [resetForm]);

  // Handle forgot password submission
  const handleForgotSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForgotForm()) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const result = await forgotPassword(forgotForm.email);

      if (result.success) {
        setEmailSent(true);
        setSuccessMessage('Password reset instructions have been sent to your email address.');
        setResendCooldown(60); // 60 second cooldown
        setForgotForm({ email: '' });
      } else {
        setErrorMessage(result.error?.message || 'Failed to send reset email. Please try again.');
      }
    } catch (error) {
      console.error('Forgot password error:', error);
      setErrorMessage('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [validateForgotForm, forgotPassword, forgotForm]);

  // Handle reset password submission
  const handleResetSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentToken) {
      setErrorMessage('Invalid or missing reset token.');
      return;
    }
    
    if (!validateResetForm()) {
      return;
    }

    // Check password validation
    if (passwordValidation && !passwordValidation.isValid) {
      setErrorMessage('Please fix password requirements before submitting.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const result = await resetPassword(currentToken, resetForm.newPassword);

      if (result.success) {
        setSuccessMessage('Password reset successfully! You can now sign in with your new password.');
        setResetForm({
          newPassword: '',
          confirmPassword: ''
        });
        setPasswordValidation(null);
        
        if (onSuccess) {
          onSuccess();
        } else {
          // Redirect to login after 3 seconds
          setTimeout(() => {
            router.push('/login');
          }, 3000);
        }
      } else {
        setErrorMessage(result.error?.message || 'Failed to reset password. Please try again.');
      }
    } catch (error) {
      console.error('Reset password error:', error);
      setErrorMessage('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [currentToken, validateResetForm, passwordValidation, resetPassword, resetForm, onSuccess, router]);

  // Get password strength color
  const getPasswordStrengthColor = useCallback((strength: string): string => {
    switch (strength) {
      case 'weak': return 'bg-red-500';
      case 'fair': return 'bg-yellow-500';
      case 'good': return 'bg-blue-500';
      case 'strong': return 'bg-green-500';
      default: return 'bg-gray-300';
    }
  }, []);

  // Render forgot password form
  const renderForgotPasswordForm = () => (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl flex items-center justify-center space-x-2">
          <Mail className="h-6 w-6" />
          <span>Reset Password</span>
        </CardTitle>
        <CardDescription>
          Enter your email address and we&apos;ll send you instructions to reset your password
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleForgotSubmit} className="space-y-4">
          {/* Email Field */}
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="Enter your email address"
              value={forgotForm.email}
              onChange={(e) => handleForgotInputChange('email', e.target.value)}
              disabled={isLoading}
              className={forgotErrors.email ? 'border-destructive' : ''}
            />
            {forgotErrors.email && (
              <p className="text-sm text-destructive">{forgotErrors.email}</p>
            )}
          </div>

          {/* Success Message */}
          {successMessage && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>{successMessage}</AlertDescription>
            </Alert>
          )}

          {/* Error Message */}
          {errorMessage && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          {/* Submit Button */}
          <Button 
            type="submit" 
            className="w-full" 
            disabled={isLoading || resendCooldown > 0}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending Instructions...
              </>
            ) : resendCooldown > 0 ? (
              <>
                <Mail className="mr-2 h-4 w-4" />
                Resend in {resendCooldown}s
              </>
            ) : emailSent ? (
              <>
                <Mail className="mr-2 h-4 w-4" />
                Resend Instructions
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                Send Reset Instructions
              </>
            )}
          </Button>

          {/* Back to Login */}
          <div className="text-center">
            <Link 
              href="/login" 
              className="text-sm text-muted-foreground hover:text-primary flex items-center justify-center space-x-1"
            >
              <ArrowLeft className="h-3 w-3" />
              <span>Back to Sign In</span>
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );

  // Render reset password form
  const renderResetPasswordForm = () => (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl flex items-center justify-center space-x-2">
          <Key className="h-6 w-6" />
          <span>Set New Password</span>
        </CardTitle>
        <CardDescription>
          Enter your new password below
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleResetSubmit} className="space-y-4">
          {/* New Password */}
          <div className="space-y-2">
            <Label htmlFor="newPassword">New Password</Label>
            <div className="relative">
              <Input
                id="newPassword"
                type={showPasswords.new ? 'text' : 'password'}
                placeholder="Enter your new password"
                value={resetForm.newPassword}
                onChange={(e) => handleResetInputChange('newPassword', e.target.value)}
                disabled={isLoading}
                className={resetErrors.newPassword ? 'border-destructive pr-10' : 'pr-10'}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => togglePasswordVisibility('new')}
                disabled={isLoading}
              >
                {showPasswords.new ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
            {resetErrors.newPassword && (
              <p className="text-sm text-destructive">{resetErrors.newPassword}</p>
            )}

            {/* Password Strength Indicator */}
            {passwordValidation && resetForm.newPassword && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Password Strength</span>
                  <span className="text-sm font-medium capitalize">{passwordValidation.strength}</span>
                </div>
                <Progress 
                  value={passwordValidation.score} 
                  className="h-2"
                />
                <div className={`h-1 rounded-full ${getPasswordStrengthColor(passwordValidation.strength)}`} 
                     style={{ width: `${passwordValidation.score}%` }} />
                
                {passwordValidation.errors.length > 0 && (
                  <div className="space-y-1">
                    {passwordValidation.errors.map((error, index) => (
                      <p key={index} className="text-xs text-destructive flex items-center space-x-1">
                        <AlertCircle className="h-3 w-3" />
                        <span>{error}</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm New Password</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showPasswords.confirm ? 'text' : 'password'}
                placeholder="Confirm your new password"
                value={resetForm.confirmPassword}
                onChange={(e) => handleResetInputChange('confirmPassword', e.target.value)}
                disabled={isLoading}
                className={resetErrors.confirmPassword ? 'border-destructive pr-10' : 'pr-10'}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => togglePasswordVisibility('confirm')}
                disabled={isLoading}
              >
                {showPasswords.confirm ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
            {resetErrors.confirmPassword && (
              <p className="text-sm text-destructive">{resetErrors.confirmPassword}</p>
            )}
          </div>

          {/* Success Message */}
          {successMessage && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>{successMessage}</AlertDescription>
            </Alert>
          )}

          {/* Error Message */}
          {errorMessage && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full"
            disabled={isLoading || Boolean(passwordValidation && !passwordValidation.isValid)}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Resetting Password...
              </>
            ) : (
              <>
                <Shield className="mr-2 h-4 w-4" />
                Reset Password
              </>
            )}
          </Button>

          {/* Cancel Button */}
          {onCancel && (
            <Button 
              type="button" 
              variant="outline" 
              className="w-full" 
              onClick={onCancel}
              disabled={isLoading}
            >
              Cancel
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      {currentMode === 'reset' ? renderResetPasswordForm() : renderForgotPasswordForm()}
    </div>
  );
}

export default PasswordReset;