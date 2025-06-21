// src/app/admin/users/new/page.tsx
// User creation page with branded type validation and enhanced UX
'use client';

import React, { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2,
  ArrowLeft,
  User,
  Mail,
  Lock,
  Shield,
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff
} from 'lucide-react';
import Link from 'next/link';
import { z } from 'zod';
import type { CreateUserRequest, Role } from '@/lib/types';
import { createUUID, createISODateString } from '@/lib/types/branded';

// Enhanced user creation validation schema with branded types
const createUserSchema = z.object({
  email: z.string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address')
    .max(254, 'Email is too long'),
  firstName: z.string()
    .min(1, 'First name is required')
    .max(50, 'First name is too long')
    .regex(/^[a-zA-Z\s'-]+$/, 'First name can only contain letters, spaces, hyphens, and apostrophes'),
  lastName: z.string()
    .min(1, 'Last name is required')
    .max(50, 'Last name is too long')
    .regex(/^[a-zA-Z\s'-]+$/, 'Last name can only contain letters, spaces, hyphens, and apostrophes'),
  password: z.string()
    .min(12, 'Password must be at least 12 characters long')
    .max(128, 'Password is too long')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  roleIds: z.array(z.string().min(1, 'Role ID is required'))
    .min(1, 'At least one role must be selected'),
  mustChangePassword: z.boolean().optional()
});

type CreateUserFormData = z.infer<typeof createUserSchema>;

// Mock roles data - in a real app, this would come from an API
const availableRoles: Role[] = [
  {
    id: createUUID('1'),
    name: 'user',
    displayName: 'Standard User',
    description: 'Standard User',
    isSystemRole: false,
    createdAt: createISODateString(new Date().toISOString()),
    updatedAt: createISODateString(new Date().toISOString())
  },
  {
    id: createUUID('2'),
    name: 'admin',
    displayName: 'Administrator',
    description: 'Administrator',
    isSystemRole: false,
    createdAt: createISODateString(new Date().toISOString()),
    updatedAt: createISODateString(new Date().toISOString())
  },
  {
    id: createUUID('3'),
    name: 'super_admin',
    displayName: 'Super Administrator',
    description: 'Super Administrator',
    isSystemRole: true,
    createdAt: createISODateString(new Date().toISOString()),
    updatedAt: createISODateString(new Date().toISOString())
  }
];

export default function CreateUserPage(): React.ReactElement {
  const { hasPermission, createUser } = useAuth();
  const router = useRouter();

  // Form state
  const [formData, setFormData] = useState<CreateUserFormData>({
    email: '',
    firstName: '',
    lastName: '',
    password: '',
    roleIds: [],
    mustChangePassword: true
  });

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof CreateUserFormData, string>>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Permission check
  const canCreateUsers = hasPermission('users:write') || hasPermission('admin:all');

  // Handle input changes
  const handleInputChange = useCallback((field: keyof CreateUserFormData, value: string | string[] | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear field error when user starts typing
    if (errors[field] !== undefined) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
    
    // Clear messages
    if (successMessage !== null) setSuccessMessage(null);
    if (errorMessage !== null) setErrorMessage(null);
  }, [errors, successMessage, errorMessage]);

  // Validate form
  const validateForm = useCallback((): boolean => {
    try {
      createUserSchema.parse(formData);
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Partial<Record<keyof CreateUserFormData, string>> = {};
        error.errors.forEach((err) => {
          if (err.path.length > 0) {
            const field = err.path[0] as keyof CreateUserFormData;
            fieldErrors[field] = err.message;
          }
        });
        setErrors(fieldErrors);
      }
      return false;
    }
  }, [formData]);

  // Handle form submission
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const createUserRequest: CreateUserRequest = {
        email: formData.email,
        firstName: formData.firstName,
        lastName: formData.lastName,
        password: formData.password,
        roleIds: formData.roleIds
      };
      
      const result = await createUser(createUserRequest);

      if (result.success && result.data !== undefined) {
        setSuccessMessage('User created successfully! Redirecting...');
        
        // Redirect after a short delay to show success message
        setTimeout(() => {
          router.push('/admin/users');
        }, 2000);
      } else {
        setErrorMessage(result.error?.message ?? 'Failed to create user');
      }
    } catch (error) {
      console.error('Create user error:', error);
      setErrorMessage('An unexpected error occurred while creating user');
    } finally {
      setIsLoading(false);
    }
  }, [formData, validateForm, createUser, router]);

  if (!canCreateUsers) {
    return (
      <div className="container mx-auto p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You don&apos;t have permission to create users.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin/users">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Users
          </Button>
        </Link>
        
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <User className="h-8 w-8" />
            Create New User
          </h1>
          <p className="text-muted-foreground">
            Add a new user account to the system with appropriate roles and permissions.
          </p>
        </div>
      </div>

      {/* Messages */}
      {successMessage !== null && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}
      
      {errorMessage !== null && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {/* Form */}
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>User Information</CardTitle>
          <CardDescription>
            Fill in the details to create a new user account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
            {/* Personal Information */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstName">
                  First Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="firstName"
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => handleInputChange('firstName', e.target.value)}
                  placeholder="Enter first name"
                  className={errors.firstName !== undefined ? 'border-red-500' : ''}
                />
                {errors.firstName !== undefined && (
                  <p className="text-sm text-red-500">{errors.firstName}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="lastName">
                  Last Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="lastName"
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => handleInputChange('lastName', e.target.value)}
                  placeholder="Enter last name"
                  className={errors.lastName !== undefined ? 'border-red-500' : ''}
                />
                {errors.lastName !== undefined && (
                  <p className="text-sm text-red-500">{errors.lastName}</p>
                )}
              </div>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">
                Email Address <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder="Enter email address"
                  className={`pl-10 ${errors.email !== undefined ? 'border-red-500' : ''}`}
                />
              </div>
              {errors.email !== undefined && (
                <p className="text-sm text-red-500">{errors.email}</p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password">
                Password <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  placeholder="Enter a secure password"
                  className={`pl-10 pr-10 ${errors.password !== undefined ? 'border-red-500' : ''}`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-1 top-1 h-8 w-8 p-0"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {errors.password !== undefined && (
                <p className="text-sm text-red-500">{errors.password}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Password must be at least 12 characters and include uppercase, lowercase, numbers, and special characters.
              </p>
            </div>

            {/* Roles */}
            <div className="space-y-2">
              <Label>
                Roles <span className="text-red-500">*</span>
              </Label>
              <Select
                onValueChange={(value) => handleInputChange('roleIds', [value])}
              >
                <SelectTrigger className={errors.roleIds !== undefined ? 'border-red-500' : ''}>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {availableRoles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        <div>
                          <div className="font-medium">{role.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {role.description}
                          </div>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.roleIds !== undefined && (
                <p className="text-sm text-red-500">{errors.roleIds}</p>
              )}
            </div>

            {/* Options */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="mustChangePassword"
                  checked={formData.mustChangePassword ?? true}
                  onCheckedChange={(checked) => 
                    handleInputChange('mustChangePassword', Boolean(checked))
                  }
                />
                <Label 
                  htmlFor="mustChangePassword"
                  className="text-sm font-normal cursor-pointer"
                >
                  Require password change on first login
                </Label>
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex items-center gap-3 pt-4 border-t">
              <Button
                type="submit"
                disabled={isLoading}
                className="flex-1"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating User...
                  </>
                ) : (
                  <>
                    <User className="mr-2 h-4 w-4" />
                    Create User
                  </>
                )}
              </Button>
              
              <Link href="/admin/users">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
