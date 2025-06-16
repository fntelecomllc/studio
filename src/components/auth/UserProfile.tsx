// src/components/auth/UserProfile.tsx
// User profile component with password change and account management
'use client';

import React, { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  Loader2, 
  Eye, 
  EyeOff, 
  AlertCircle, 
  CheckCircle, 
  Shield, 
  User, 
  Mail, 
  Calendar,
  Key,
  Lock
} from 'lucide-react';
import { z } from 'zod';
import type { PasswordValidationResult } from '@/lib/types';

// Password change validation schema
const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(12, 'Password must be at least 12 characters long'),
  confirmPassword: z.string().min(1, 'Please confirm your new password')
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type PasswordChangeFormData = z.infer<typeof passwordChangeSchema>;

interface UserProfileProps {
  showPasswordChange?: boolean;
  showAccountInfo?: boolean;
  onPasswordChanged?: () => void;
}

export function UserProfile({
  showPasswordChange = true,
  showAccountInfo = true,
  onPasswordChanged
}: UserProfileProps) {
  const { user, changePassword, validatePassword } = useAuth();
  
  const [passwordForm, setPasswordForm] = useState<PasswordChangeFormData>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  
  const [errors, setErrors] = useState<Partial<Record<keyof PasswordChangeFormData, string>>>({});
  const [isPasswordChangeLoading, setIsPasswordChangeLoading] = useState(false);
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  });
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [passwordValidation, setPasswordValidation] = useState<PasswordValidationResult | null>(null);

  // Handle form input changes
  const handlePasswordInputChange = useCallback((field: keyof PasswordChangeFormData, value: string) => {
    setPasswordForm(prev => ({ ...prev, [field]: value }));
    
    // Clear field error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
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
  }, [errors, successMessage, errorMessage, validatePassword]);

  // Toggle password visibility
  const togglePasswordVisibility = useCallback((field: keyof typeof showPasswords) => {
    setShowPasswords(prev => ({ ...prev, [field]: !prev[field] }));
  }, []);

  // Validate password change form
  const validatePasswordForm = useCallback((): boolean => {
    try {
      passwordChangeSchema.parse(passwordForm);
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Partial<Record<keyof PasswordChangeFormData, string>> = {};
        error.errors.forEach(err => {
          if (err.path[0]) {
            fieldErrors[err.path[0] as keyof PasswordChangeFormData] = err.message;
          }
        });
        setErrors(fieldErrors);
      }
      return false;
    }
  }, [passwordForm]);

  // Handle password change submission
  const handlePasswordChange = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validatePasswordForm()) {
      return;
    }

    // Check password validation
    if (passwordValidation && !passwordValidation.isValid) {
      setErrorMessage('Please fix password requirements before submitting.');
      return;
    }

    setIsPasswordChangeLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const result = await changePassword(passwordForm.currentPassword, passwordForm.newPassword);

      if (result.success) {
        setSuccessMessage('Password changed successfully!');
        setPasswordForm({
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        });
        setPasswordValidation(null);
        
        if (onPasswordChanged) {
          onPasswordChanged();
        }
      } else {
        setErrorMessage(result.error?.message || 'Failed to change password. Please try again.');
      }
    } catch (error) {
      console.error('Password change error:', error);
      setErrorMessage('An unexpected error occurred. Please try again.');
    } finally {
      setIsPasswordChangeLoading(false);
    }
  }, [validatePasswordForm, passwordValidation, changePassword, passwordForm, onPasswordChanged]);

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

  // Format date
  const formatDate = useCallback((dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }, []);

  if (!user) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
          <p className="text-muted-foreground">Loading user profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Account Information */}
      {showAccountInfo && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <User className="h-5 w-5" />
              <span>Account Information</span>
            </CardTitle>
            <CardDescription>
              Your account details and security status
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center space-x-2">
                  <User className="h-4 w-4" />
                  <span>Name</span>
                </Label>
                <p className="text-sm font-medium">{user.name}</p>
              </div>
              
              <div className="space-y-2">
                <Label className="flex items-center space-x-2">
                  <Mail className="h-4 w-4" />
                  <span>Email</span>
                </Label>
                <p className="text-sm font-medium">{user.email}</p>
              </div>
              
              <div className="space-y-2">
                <Label>Role</Label>
                <Badge variant="secondary">{user.role}</Badge>
              </div>
              
              <div className="space-y-2">
                <Label>Account Status</Label>
                <Badge variant={user.isActive ? "default" : "destructive"}>
                  {user.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              
              {user.lastLoginAt && (
                <div className="space-y-2">
                  <Label className="flex items-center space-x-2">
                    <Calendar className="h-4 w-4" />
                    <span>Last Login</span>
                  </Label>
                  <p className="text-sm">{formatDate(user.lastLoginAt)}</p>
                </div>
              )}
              
              <div className="space-y-2">
                <Label>Permissions</Label>
                <div className="flex flex-wrap gap-1">
                  {user.permissions.slice(0, 3).map((permission) => (
                    <Badge key={permission} variant="outline" className="text-xs">
                      {permission}
                    </Badge>
                  ))}
                  {user.permissions.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{user.permissions.length - 3} more
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Security Alerts */}
            {user.mustChangePassword && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  You must change your password before continuing to use the application.
                </AlertDescription>
              </Alert>
            )}

            {user.failedLoginAttempts > 0 && (
              <Alert variant="destructive">
                <Shield className="h-4 w-4" />
                <AlertDescription>
                  {user.failedLoginAttempts} recent failed login attempt{user.failedLoginAttempts !== 1 ? 's' : ''} detected.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Password Change */}
      {showPasswordChange && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Key className="h-5 w-5" />
              <span>Change Password</span>
            </CardTitle>
            <CardDescription>
              Update your password to keep your account secure
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordChange} className="space-y-4">
              {/* Current Password */}
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Current Password</Label>
                <div className="relative">
                  <Input
                    id="currentPassword"
                    type={showPasswords.current ? 'text' : 'password'}
                    placeholder="Enter your current password"
                    value={passwordForm.currentPassword}
                    onChange={(e) => handlePasswordInputChange('currentPassword', e.target.value)}
                    disabled={isPasswordChangeLoading}
                    className={errors.currentPassword ? 'border-destructive pr-10' : 'pr-10'}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => togglePasswordVisibility('current')}
                    disabled={isPasswordChangeLoading}
                  >
                    {showPasswords.current ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {errors.currentPassword && (
                  <p className="text-sm text-destructive">{errors.currentPassword}</p>
                )}
              </div>

              {/* New Password */}
              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showPasswords.new ? 'text' : 'password'}
                    placeholder="Enter your new password"
                    value={passwordForm.newPassword}
                    onChange={(e) => handlePasswordInputChange('newPassword', e.target.value)}
                    disabled={isPasswordChangeLoading}
                    className={errors.newPassword ? 'border-destructive pr-10' : 'pr-10'}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => togglePasswordVisibility('new')}
                    disabled={isPasswordChangeLoading}
                  >
                    {showPasswords.new ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {errors.newPassword && (
                  <p className="text-sm text-destructive">{errors.newPassword}</p>
                )}

                {/* Password Strength Indicator */}
                {passwordValidation && passwordForm.newPassword && (
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
                    value={passwordForm.confirmPassword}
                    onChange={(e) => handlePasswordInputChange('confirmPassword', e.target.value)}
                    disabled={isPasswordChangeLoading}
                    className={errors.confirmPassword ? 'border-destructive pr-10' : 'pr-10'}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => togglePasswordVisibility('confirm')}
                    disabled={isPasswordChangeLoading}
                  >
                    {showPasswords.confirm ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {errors.confirmPassword && (
                  <p className="text-sm text-destructive">{errors.confirmPassword}</p>
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
                disabled={isPasswordChangeLoading || Boolean(passwordValidation && !passwordValidation.isValid)}
              >
                {isPasswordChangeLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Changing Password...
                  </>
                ) : (
                  <>
                    <Lock className="mr-2 h-4 w-4" />
                    Change Password
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default UserProfile;