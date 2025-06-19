// src/app/admin/users/[id]/edit/page.tsx
// User editing page with branded type safety and comprehensive validation
'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Loader2,
  ArrowLeft,
  User,
  Mail,
  Shield,
  AlertCircle,
  CheckCircle,
  Save,
  UserCheck,
  UserX,
  Lock
} from 'lucide-react';
import Link from 'next/link';
import { z } from 'zod';
import type { UpdateUserRequest, User as UserType, Role } from '@/lib/types';
import { createUUID, createISODateString } from '@/lib/types/branded';

// Enhanced user update validation schema
const updateUserSchema = z.object({
  firstName: z.string()
    .min(1, 'First name is required')
    .max(50, 'First name is too long')
    .regex(/^[a-zA-Z\s'-]+$/, 'First name can only contain letters, spaces, hyphens, and apostrophes')
    .optional(),
  lastName: z.string()
    .min(1, 'Last name is required')
    .max(50, 'Last name is too long')
    .regex(/^[a-zA-Z\s'-]+$/, 'Last name can only contain letters, spaces, hyphens, and apostrophes')
    .optional(),
  email: z.string()
    .email('Please enter a valid email address')
    .max(254, 'Email is too long')
    .optional(),
  roleIds: z.array(z.string().min(1, 'Role ID is required'))
    .min(1, 'At least one role must be selected')
    .optional(),
  isActive: z.boolean().optional(),
  mustChangePassword: z.boolean().optional()
});

type UpdateUserFormData = z.infer<typeof updateUserSchema>;

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

export default function EditUserPage() {
  const { hasPermission, updateUser, getUsers } = useAuth();
  const params = useParams();
  const userId = params.id as string;

  // State management
  const [user, setUser] = useState<UserType | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<UpdateUserFormData>({});
  const [errors, setErrors] = useState<Partial<Record<keyof UpdateUserFormData, string>>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Permission check
  const canEditUsers = hasPermission('users:write') || hasPermission('admin:all');

  // Load user data
  const loadUser = useCallback(async () => {
    setIsLoadingUser(true);
    setErrorMessage(null);
    
    try {
      const result = await getUsers();
      if (result.success && result.data) {
        const foundUser = result.data.data?.find(u => u.id === userId);
        if (foundUser) {
          setUser(foundUser);
          setFormData({
            firstName: foundUser.firstName,
            lastName: foundUser.lastName,
            email: foundUser.email,
            roleIds: foundUser.roles?.map(role => role.id) || [],
            isActive: foundUser.isActive,
            mustChangePassword: foundUser.mustChangePassword
          });
        } else {
          setErrorMessage('User not found');
        }
      } else {
        setErrorMessage(result.error?.message || 'Failed to load user');
      }
    } catch (error) {
      console.error('Load user error:', error);
      setErrorMessage('An unexpected error occurred while loading user');
    } finally {
      setIsLoadingUser(false);
    }
  }, [userId, getUsers]);

  // Load user on component mount
  useEffect(() => {
    if (userId) {
      loadUser();
    }
  }, [userId, loadUser]);

  // Handle input changes
  const handleInputChange = useCallback((field: keyof UpdateUserFormData, value: string | string[] | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear field error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
    
    // Clear messages
    if (successMessage) setSuccessMessage(null);
    if (errorMessage) setErrorMessage(null);
  }, [errors, successMessage, errorMessage]);

  // Validate form
  const validateForm = useCallback((): boolean => {
    try {
      updateUserSchema.parse(formData);
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Partial<Record<keyof UpdateUserFormData, string>> = {};
        error.errors.forEach((err) => {
          if (err.path.length > 0) {
            const field = err.path[0] as keyof UpdateUserFormData;
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
      const updateUserRequest: UpdateUserRequest = {};
      
      // Only include changed fields
      if (formData.firstName !== user?.firstName) {
        updateUserRequest.firstName = formData.firstName;
      }
      if (formData.lastName !== user?.lastName) {
        updateUserRequest.lastName = formData.lastName;
      }
      if (formData.roleIds && JSON.stringify(formData.roleIds) !== JSON.stringify(user?.roles?.map(r => r.id))) {
        updateUserRequest.roleIds = formData.roleIds;
      }
      if (formData.isActive !== user?.isActive) {
        updateUserRequest.isActive = formData.isActive;
      }
      
      const result = await updateUser(userId, updateUserRequest);

      if (result.success) {
        setSuccessMessage('User updated successfully!');
        // Reload user data to reflect changes
        await loadUser();
      } else {
        setErrorMessage(result.error?.message || 'Failed to update user');
      }
    } catch (error) {
      console.error('Update user error:', error);
      setErrorMessage('An unexpected error occurred while updating user');
    } finally {
      setIsLoading(false);
    }
  }, [formData, user, validateForm, updateUser, userId, loadUser]);

  if (!canEditUsers) {
    return (
      <div className="container mx-auto p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You don&apos;t have permission to edit users.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoadingUser) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="ml-2">Loading user...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {errorMessage || 'User not found'}
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
            Edit User
          </h1>
          <p className="text-muted-foreground">
            Modify user account details, roles, and settings.
          </p>
        </div>
      </div>

      {/* Messages */}
      {successMessage && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}
      
      {errorMessage && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* User Info Card */}
        <Card>
          <CardHeader>
            <CardTitle>User Information</CardTitle>
            <CardDescription>
              Basic user account details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">User ID</Label>
              <div className="text-sm text-muted-foreground font-mono">
                {user.id}
              </div>
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm font-medium">Email Verified</Label>
              <div className="flex items-center gap-2">
                {user.emailVerified ? (
                  <>
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm">Verified</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4 text-yellow-500" />
                    <span className="text-sm">Unverified</span>
                  </>
                )}
              </div>
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm font-medium">Last Login</Label>
              <div className="text-sm text-muted-foreground">
                {user.lastLoginAt ? (
                  new Date(user.lastLoginAt).toLocaleString()
                ) : (
                  'Never'
                )}
              </div>
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm font-medium">Created</Label>
              <div className="text-sm text-muted-foreground">
                {new Date(user.createdAt).toLocaleString()}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Edit Form */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Edit Details</CardTitle>
            <CardDescription>
              Update the user&apos;s information and settings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Personal Information */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    type="text"
                    value={formData.firstName || ''}
                    onChange={(e) => handleInputChange('firstName', e.target.value)}
                    placeholder="Enter first name"
                    className={errors.firstName ? 'border-red-500' : ''}
                  />
                  {errors.firstName && (
                    <p className="text-sm text-red-500">{errors.firstName}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    type="text"
                    value={formData.lastName || ''}
                    onChange={(e) => handleInputChange('lastName', e.target.value)}
                    placeholder="Enter last name"
                    className={errors.lastName ? 'border-red-500' : ''}
                  />
                  {errors.lastName && (
                    <p className="text-sm text-red-500">{errors.lastName}</p>
                  )}
                </div>
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    placeholder="Enter email address"
                    className={`pl-10 ${errors.email ? 'border-red-500' : ''}`}
                  />
                </div>
                {errors.email && (
                  <p className="text-sm text-red-500">{errors.email}</p>
                )}
              </div>

              <Separator />

              {/* Roles */}
              <div className="space-y-2">
                <Label>Roles</Label>
                <Select
                  value={formData.roleIds?.[0] || ''}
                  onValueChange={(value) => handleInputChange('roleIds', [value])}
                >
                  <SelectTrigger className={errors.roleIds ? 'border-red-500' : ''}>
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
                {errors.roleIds && (
                  <p className="text-sm text-red-500">{errors.roleIds}</p>
                )}
              </div>

              <Separator />

              {/* Account Status */}
              <div className="space-y-4">
                <Label className="text-base font-medium">Account Status</Label>
                
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="isActive"
                      checked={formData.isActive}
                      onCheckedChange={(checked) => 
                        handleInputChange('isActive', Boolean(checked))
                      }
                    />
                    <Label 
                      htmlFor="isActive"
                      className="text-sm font-normal cursor-pointer flex items-center gap-2"
                    >
                      {formData.isActive ? (
                        <>
                          <UserCheck className="h-4 w-4 text-green-500" />
                          Account is active
                        </>
                      ) : (
                        <>
                          <UserX className="h-4 w-4 text-red-500" />
                          Account is inactive
                        </>
                      )}
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="mustChangePassword"
                      checked={formData.mustChangePassword}
                      onCheckedChange={(checked) => 
                        handleInputChange('mustChangePassword', Boolean(checked))
                      }
                    />
                    <Label 
                      htmlFor="mustChangePassword"
                      className="text-sm font-normal cursor-pointer flex items-center gap-2"
                    >
                      <Lock className="h-4 w-4" />
                      Require password change on next login
                    </Label>
                  </div>
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
                      Updating User...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Update User
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
    </div>
  );
}
