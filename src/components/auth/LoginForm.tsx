// src/components/auth/LoginForm.tsx
// Enhanced login form component with improved validation, security features, and rate limiting
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Eye, EyeOff, AlertCircle, Shield, Clock, Lock } from 'lucide-react';
import Link from 'next/link';
import { z } from 'zod';

// Enhanced validation schema with security considerations
const loginSchema = z.object({
  email: z.string()
    .email('Please enter a valid email address')
    .min(1, 'Email is required')
    .max(254, 'Email is too long'),
  password: z.string()
    .min(1, 'Password is required')
    .max(128, 'Password is too long'),
  rememberMe: z.boolean().optional()
});

type LoginFormData = z.infer<typeof loginSchema>;

interface LoginFormProps {
  redirectTo?: string;
  showSignUpLink?: boolean;
  title?: string;
  description?: string;
  enableCaptcha?: boolean;
  maxAttempts?: number;
}

interface SecurityState {
  failedAttempts: number;
  isLocked: boolean;
  lockoutEndTime: number | null;
  rateLimitRemaining: number | null;
  showCaptcha: boolean;
}

export function LoginForm({
  redirectTo,
  showSignUpLink = true,
  title = 'Sign in to DomainFlow',
  description = 'Enter your credentials to access your account',
  enableCaptcha = false,
  maxAttempts = 5
}: LoginFormProps) {
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [formData, setFormData] = useState<LoginFormData>({
    email: '',
    password: '',
    rememberMe: false
  });
  
  const [errors, setErrors] = useState<Partial<Record<keyof LoginFormData, string>>>({});
  const [isMainLoginLoading, setIsMainLoginLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  
  // Enhanced security state
  const [securityState, setSecurityState] = useState<SecurityState>({
    failedAttempts: 0,
    isLocked: false,
    lockoutEndTime: null,
    rateLimitRemaining: null,
    showCaptcha: false
  });
  
  const [lockoutTimeRemaining, setLockoutTimeRemaining] = useState<number>(0);

  // Lockout timer effect
  useEffect(() => {
    let timer: NodeJS.Timeout;
    
    if (securityState.isLocked && securityState.lockoutEndTime) {
      const updateTimer = () => {
        const remaining = Math.max(0, securityState.lockoutEndTime! - Date.now());
        setLockoutTimeRemaining(remaining);
        
        if (remaining <= 0) {
          setSecurityState(prev => ({
            ...prev,
            isLocked: false,
            lockoutEndTime: null,
            failedAttempts: 0
          }));
        }
      };
      
      updateTimer();
      timer = setInterval(updateTimer, 1000);
    }
    
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [securityState.isLocked, securityState.lockoutEndTime]);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      const redirectParam = searchParams.get('redirect');
      const redirectUrl = redirectParam || redirectTo || '/dashboard';
      router.push(redirectUrl);
    }
  }, [isAuthenticated, authLoading, router, searchParams, redirectTo]);

  // Format lockout time remaining
  const formatLockoutTime = useCallback((ms: number): string => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, []);

  // Handle security lockout
  const handleSecurityLockout = useCallback((failedAttempts: number) => {
    const newFailedAttempts = failedAttempts + 1;
    
    if (newFailedAttempts >= maxAttempts) {
      const lockoutDuration = 15 * 60 * 1000; // 15 minutes
      const lockoutEndTime = Date.now() + lockoutDuration;
      
      setSecurityState(prev => ({
        ...prev,
        failedAttempts: newFailedAttempts,
        isLocked: true,
        lockoutEndTime,
        showCaptcha: true
      }));
      
      setLoginError(`Account temporarily locked due to too many failed attempts. Please try again in 15 minutes.`);
    } else {
      setSecurityState(prev => ({
        ...prev,
        failedAttempts: newFailedAttempts,
        showCaptcha: newFailedAttempts >= 3 // Show CAPTCHA after 3 attempts
      }));
      
      const remainingAttempts = maxAttempts - newFailedAttempts;
      setLoginError(`Invalid credentials. ${remainingAttempts} attempt${remainingAttempts !== 1 ? 's' : ''} remaining before account lockout.`);
    }
  }, [maxAttempts]);

  // Reset security state on successful login
  const resetSecurityState = useCallback(() => {
    setSecurityState({
      failedAttempts: 0,
      isLocked: false,
      lockoutEndTime: null,
      rateLimitRemaining: null,
      showCaptcha: false
    });
  }, []);

  // Handle form input changes
  const handleInputChange = (field: keyof LoginFormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear field error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
    
    // Clear login error
    if (loginError) {
      setLoginError(null);
    }
  };

  // Validate form
  const validateForm = (): boolean => {
    try {
      loginSchema.parse(formData);
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Partial<Record<keyof LoginFormData, string>> = {};
        error.errors.forEach(err => {
          if (err.path[0]) {
            fieldErrors[err.path[0] as keyof LoginFormData] = err.message;
          }
        });
        setErrors(fieldErrors);
      }
      return false;
    }
  };

  // Handle form submission with enhanced security
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check if account is locked
    if (securityState.isLocked) {
      setLoginError(`Account is locked. Please try again in ${formatLockoutTime(lockoutTimeRemaining)}.`);
      return;
    }
    
    if (!validateForm()) {
      return;
    }

    setIsMainLoginLoading(true);
    setLoginError(null);

    try {
      const result = await login({
        email: formData.email,
        password: formData.password,
        rememberMe: formData.rememberMe
      });

      if (result.success) {
        resetSecurityState();
        // Redirect will happen via useEffect when isAuthenticated changes
        console.log('Login successful, redirecting...');
      } else {
        // Handle failed login with security measures
        handleSecurityLockout(securityState.failedAttempts);
        
        // Parse specific error messages
        const errorMessage = result.error || 'Login failed. Please try again.';
        if (errorMessage.includes('locked')) {
          setLoginError('Account is temporarily locked due to security reasons. Please try again later or contact support.');
        } else if (errorMessage.includes('rate limit')) {
          setLoginError('Too many login attempts. Please wait a moment before trying again.');
        } else if (errorMessage.includes('Invalid credentials')) {
          setLoginError('Invalid email or password. Please check your credentials and try again.');
        } else if (errorMessage.includes('Network error')) {
          setLoginError('Network error. Please check your connection and ensure the backend is running.');
        } else {
          // Don't show the specific error from handleSecurityLockout if we already set a custom message
          if (!loginError) {
            setLoginError(errorMessage);
          }
        }
      }
    } catch (error) {
      console.error('Login error:', error);
      setLoginError('An unexpected error occurred. Please try again.');
      handleSecurityLockout(securityState.failedAttempts);
    } finally {
      setIsMainLoginLoading(false);
    }
  };

  // Show loading if already authenticated
  if (isAuthenticated && !authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
          <p className="text-muted-foreground">Redirecting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Field */}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  disabled={isMainLoginLoading}
                  className={errors.email ? 'border-destructive' : ''}
                />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email}</p>
              )}
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  disabled={isMainLoginLoading}
                  className={errors.password ? 'border-destructive pr-10' : 'pr-10'}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isMainLoginLoading}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password}</p>
              )}
            </div>

            {/* Remember Me */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="rememberMe"
                checked={formData.rememberMe}
                onCheckedChange={(checked) => handleInputChange('rememberMe', !!checked)}
                disabled={isMainLoginLoading}
              />
              <Label htmlFor="rememberMe" className="text-sm">
                Remember me
              </Label>
            </div>

            {/* Security Status */}
            {securityState.isLocked && (
              <Alert variant="destructive">
                <Lock className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <p>Account temporarily locked for security.</p>
                    <div className="flex items-center space-x-2">
                      <Clock className="h-3 w-3" />
                      <span className="text-sm">
                        Unlocks in: {formatLockoutTime(lockoutTimeRemaining)}
                      </span>
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Failed Attempts Warning */}
            {securityState.failedAttempts > 0 && !securityState.isLocked && (
              <Alert variant="destructive">
                <Shield className="h-4 w-4" />
                <AlertDescription>
                  {securityState.failedAttempts} failed attempt{securityState.failedAttempts !== 1 ? 's' : ''}.
                  {maxAttempts - securityState.failedAttempts} remaining before lockout.
                </AlertDescription>
              </Alert>
            )}

            {/* CAPTCHA Placeholder */}
            {securityState.showCaptcha && enableCaptcha && (
              <Alert>
                <Shield className="h-4 w-4" />
                <AlertDescription>
                  Security verification required. CAPTCHA integration coming soon.
                </AlertDescription>
              </Alert>
            )}

            {/* Login Error */}
            {loginError && !securityState.isLocked && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{loginError}</AlertDescription>
              </Alert>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full"
              disabled={isMainLoginLoading || securityState.isLocked}
            >
              {isMainLoginLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : securityState.isLocked ? (
                <>
                  <Lock className="mr-2 h-4 w-4" />
                  Account Locked
                </>
              ) : (
                <>
                  <Shield className="mr-2 h-4 w-4" />
                  Sign in Securely
                </>
              )}
            </Button>
          </form>

          {/* Additional Links */}
          <div className="mt-6 space-y-4">
            {showSignUpLink && (
              <div className="text-center">
                <span className="text-sm text-muted-foreground">
                  Don&apos;t have an account?{' '}
                  <Link 
                    href="/signup" 
                    className="text-primary hover:underline"
                  >
                    Sign up
                  </Link>
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default LoginForm;