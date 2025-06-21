// src/components/auth/UserManagement.tsx
// Admin user management component with CRUD operations and security features
'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Loader2,
  Plus,
  Edit,
  Trash2,
  Users,
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  Search
} from 'lucide-react';
import { z } from 'zod';
import type { User } from '@/lib/types';

// User creation validation schema
const createUserSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name is too long'),
  email: z.string().email('Please enter a valid email address').max(254, 'Email is too long'),
  password: z.string().min(12, 'Password must be at least 12 characters long'),
  roleId: z.string().min(1, 'Role is required'),
  mustChangePassword: z.boolean().optional()
});

// User update validation schema
const updateUserSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name is too long').optional(),
  email: z.string().email('Please enter a valid email address').max(254, 'Email is too long').optional(),
  roleId: z.string().min(1, 'Role is required').optional(),
  isActive: z.boolean().optional(),
  mustChangePassword: z.boolean().optional()
});

type CreateUserFormData = z.infer<typeof createUserSchema>;
type UpdateUserFormData = z.infer<typeof updateUserSchema>;

interface UserManagementProps {
  onUserCreated?: (user: User) => void;
  onUserUpdated?: (user: User) => void;
  onUserDeleted?: (userId: string) => void;
}

// Mock roles data - in a real app, this would come from an API
const ROLES = [
  { id: '1', name: 'super_admin', description: 'Super Administrator' },
  { id: '2', name: 'admin', description: 'Administrator' },
  { id: '3', name: 'campaign_manager', description: 'Campaign Manager' },
  { id: '4', name: 'analyst', description: 'Analyst' },
  { id: '5', name: 'user', description: 'User' }
];

export function UserManagement({
  onUserCreated,
  onUserUpdated,
  onUserDeleted
}: UserManagementProps): React.ReactElement {
  const { user: currentUser, getUsers, createUser, updateUser, deleteUser, hasPermission } = useAuth();
  
  const [users, setUsers] = useState<User[]>([]);
  const [_totalUsers, setTotalUsers] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  
  const [createForm, setCreateForm] = useState<CreateUserFormData>({
    name: '',
    email: '',
    password: '',
    roleId: '',
    mustChangePassword: true
  });
  
  const [updateForm, setUpdateForm] = useState<UpdateUserFormData>({});
  
  const [createErrors, setCreateErrors] = useState<Partial<Record<keyof CreateUserFormData, string>>>({});
  const [updateErrors, setUpdateErrors] = useState<Partial<Record<keyof UpdateUserFormData, string>>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Check if user has admin permissions
  const canManageUsers = hasPermission('users:write') === true || hasPermission('admin:all') === true;
  const canViewUsers = hasPermission('users:read') === true || hasPermission('admin:all') === true;

  // Load users
  const loadUsers = useCallback(async (page: number = 1, limit: number = 20): Promise<void> => {
    if (canViewUsers === false) return;
    
    setIsLoading(true);
    try {
      const result = await getUsers(page, limit);
      if (result.success && result.data !== null && result.data !== undefined) {
        setUsers(result.data.data ?? []); // result.data.data is User[] array
        setTotalUsers(result.data.metadata?.page?.total ?? 0);
        setCurrentPage(result.data.metadata?.page?.current ?? page);
      } else {
        setErrorMessage(result.error?.message ?? 'Failed to load users');
      }
    } catch (error) {
      console.error('Load users error:', error);
      setErrorMessage('An unexpected error occurred while loading users');
    } finally {
      setIsLoading(false);
    }
  }, [canViewUsers, getUsers]);

  // Load users on component mount
  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  // Handle create form input changes
  const handleCreateInputChange = useCallback((field: keyof CreateUserFormData, value: string | boolean) => {
    setCreateForm(prev => ({ ...prev, [field]: value }));
    
    // Clear field error when user starts typing
    if (createErrors[field] !== undefined && createErrors[field] !== null) {
      setCreateErrors(prev => ({ ...prev, [field]: undefined }));
    }
    
    // Clear messages
    if (successMessage !== null && successMessage !== undefined) setSuccessMessage(null);
    if (errorMessage !== null && errorMessage !== undefined) setErrorMessage(null);
  }, [createErrors, successMessage, errorMessage]);

  // Handle update form input changes
  const handleUpdateInputChange = useCallback((field: keyof UpdateUserFormData, value: string | boolean) => {
    setUpdateForm(prev => ({ ...prev, [field]: value }));
    
    // Clear field error when user starts typing
    if (updateErrors[field] !== undefined && updateErrors[field] !== null) {
      setUpdateErrors(prev => ({ ...prev, [field]: undefined }));
    }
    
    // Clear messages
    if (successMessage !== null && successMessage !== undefined) setSuccessMessage(null);
    if (errorMessage !== null && errorMessage !== undefined) setErrorMessage(null);
  }, [updateErrors, successMessage, errorMessage]);

  // Validate create form
  const validateCreateForm = useCallback((): boolean => {
    try {
      createUserSchema.parse(createForm);
      setCreateErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Partial<Record<keyof CreateUserFormData, string>> = {};
        error.errors.forEach(err => {
          if (err.path[0] !== undefined) {
            fieldErrors[err.path[0] as keyof CreateUserFormData] = err.message;
          }
        });
        setCreateErrors(fieldErrors);
      }
      return false;
    }
  }, [createForm]);

  // Validate update form
  const validateUpdateForm = useCallback((): boolean => {
    try {
      updateUserSchema.parse(updateForm);
      setUpdateErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Partial<Record<keyof UpdateUserFormData, string>> = {};
        error.errors.forEach(err => {
          if (err.path[0] !== undefined) {
            fieldErrors[err.path[0] as keyof UpdateUserFormData] = err.message;
          }
        });
        setUpdateErrors(fieldErrors);
      }
      return false;
    }
  }, [updateForm]);

  // Handle create user submission
  const handleCreateSubmit = useCallback(async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    
    if (!validateCreateForm()) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      // Transform form data to match CreateUserRequest interface
      const [firstName, ...lastNameParts] = createForm.name.split(' ');
      const lastName = lastNameParts.length > 0 ? lastNameParts.join(' ') : 'User'; // fallback if no last name
      
      const createUserRequest = {
        email: createForm.email,
        firstName: firstName ?? 'User',
        lastName,
        password: createForm.password,
        roleIds: [createForm.roleId]
      };
      
      const result = await createUser(createUserRequest);

      if (result.success && result.data !== null && result.data !== undefined) {
        setSuccessMessage('User created successfully!');
        setCreateForm({
          name: '',
          email: '',
          password: '',
          roleId: '',
          mustChangePassword: true
        });
        setIsCreateDialogOpen(false);
        await loadUsers(currentPage);
        
        if (onUserCreated !== undefined) {
          onUserCreated(result.data);
        }
      } else {
        setErrorMessage(result.error?.message ?? 'Failed to create user');
      }
    } catch (error) {
      console.error('Create user error:', error);
      setErrorMessage('An unexpected error occurred while creating user');
    } finally {
      setIsLoading(false);
    }
  }, [validateCreateForm, createUser, createForm, currentPage, loadUsers, onUserCreated]);

  // Handle update user submission
  const handleUpdateSubmit = useCallback(async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    
    if (selectedUser === null || selectedUser === undefined || validateUpdateForm() === false) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const result = await updateUser(selectedUser.id, updateForm);

      if (result.success && result.data !== null && result.data !== undefined) {
        setSuccessMessage('User updated successfully!');
        setUpdateForm({});
        setIsEditDialogOpen(false);
        setSelectedUser(null);
        await loadUsers(currentPage);
        
        if (onUserUpdated !== undefined) {
          onUserUpdated(result.data);
        }
      } else {
        setErrorMessage(result.error?.message ?? 'Failed to update user');
      }
    } catch (error) {
      console.error('Update user error:', error);
      setErrorMessage('An unexpected error occurred while updating user');
    } finally {
      setIsLoading(false);
    }
  }, [selectedUser, validateUpdateForm, updateUser, updateForm, currentPage, loadUsers, onUserUpdated]);

  // Handle delete user
  const handleDeleteUser = useCallback(async (user: User): Promise<void> => {
    if (!confirm(`Are you sure you want to delete user "${user.firstName} ${user.lastName}"? This action cannot be undone.`)) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const result = await deleteUser(user.id);

      if (result.success) {
        setSuccessMessage('User deleted successfully!');
        await loadUsers(currentPage);
        
        if (onUserDeleted !== undefined) {
          onUserDeleted(user.id);
        }
      } else {
        setErrorMessage(result.error?.message ?? 'Failed to delete user');
      }
    } catch (error) {
      console.error('Delete user error:', error);
      setErrorMessage('An unexpected error occurred while deleting user');
    } finally {
      setIsLoading(false);
    }
  }, [deleteUser, currentPage, loadUsers, onUserDeleted]);

  // Open edit dialog
  const openEditDialog = useCallback((user: User) => {
    setSelectedUser(user);
    setUpdateForm({
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      roleId: user.roles?.[0]?.id ?? '',
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword
    });
    setIsEditDialogOpen(true);
  }, []);

  // Filter users based on search and filters
  const filteredUsers = users.filter(user => {
    const displayName = `${user.firstName} ${user.lastName}`.trim();
    const nameForSearch = displayName.length > 0 ? displayName : user.email;
    const matchesSearch = nameForSearch.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'all' || (user.roles?.[0]?.name ?? 'user') === roleFilter;
    const matchesStatus = statusFilter === 'all' ||
                         (statusFilter === 'active' && user.isActive) ||
                         (statusFilter === 'inactive' && user.isActive === false);
    return matchesSearch && matchesRole && matchesStatus;
  });

  // Format date
  const formatDate = useCallback((dateString?: string): string => {
    if (dateString === undefined || dateString === null) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }, []);

  if (canViewUsers === false) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          You don&apos;t have permission to view user management.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center space-x-2">
            <Users className="h-6 w-6" />
            <span>User Management</span>
          </h2>
          <p className="text-muted-foreground">Manage user accounts and permissions</p>
        </div>
        
        {canManageUsers && (
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create User
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create New User</DialogTitle>
                <DialogDescription>
                  Add a new user to the system
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={(e) => void handleCreateSubmit(e)} className="space-y-4">
                {/* Name */}
                <div className="space-y-2">
                  <Label htmlFor="create-name">Name</Label>
                  <Input
                    id="create-name"
                    placeholder="Enter user's full name"
                    value={createForm.name}
                    onChange={(e) => handleCreateInputChange('name', e.target.value)}
                    disabled={isLoading}
                    className={createErrors.name !== undefined ? 'border-destructive' : ''}
                  />
                  {createErrors.name !== undefined && (
                    <p className="text-sm text-destructive">{createErrors.name}</p>
                  )}
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <Label htmlFor="create-email">Email</Label>
                  <Input
                    id="create-email"
                    type="email"
                    placeholder="Enter user's email address"
                    value={createForm.email}
                    onChange={(e) => handleCreateInputChange('email', e.target.value)}
                    disabled={isLoading}
                    className={createErrors.email !== undefined ? 'border-destructive' : ''}
                  />
                  {createErrors.email !== undefined && (
                    <p className="text-sm text-destructive">{createErrors.email}</p>
                  )}
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <Label htmlFor="create-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="create-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter temporary password"
                      value={createForm.password}
                      onChange={(e) => handleCreateInputChange('password', e.target.value)}
                      disabled={isLoading}
                      className={createErrors.password !== undefined ? 'border-destructive pr-10' : 'pr-10'}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={isLoading}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {createErrors.password !== undefined && (
                    <p className="text-sm text-destructive">{createErrors.password}</p>
                  )}
                </div>

                {/* Role */}
                <div className="space-y-2">
                  <Label htmlFor="create-role">Role</Label>
                  <Select
                    value={createForm.roleId}
                    onValueChange={(value) => handleCreateInputChange('roleId', value)}
                    disabled={isLoading}
                  >
                    <SelectTrigger className={createErrors.roleId !== undefined ? 'border-destructive' : ''}>
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {createErrors.roleId !== undefined && (
                    <p className="text-sm text-destructive">{createErrors.roleId}</p>
                  )}
                </div>

                {/* Must Change Password */}
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="create-mustChangePassword"
                    checked={createForm.mustChangePassword}
                    onCheckedChange={(checked) => handleCreateInputChange('mustChangePassword', checked === true)}
                    disabled={isLoading}
                  />
                  <Label htmlFor="create-mustChangePassword" className="text-sm">
                    Require password change on first login
                  </Label>
                </div>

                {/* Error Message */}
                {errorMessage !== null && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{errorMessage}</AlertDescription>
                  </Alert>
                )}

                {/* Submit Button */}
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating User...
                    </>
                  ) : (
                    <>
                      <Plus className="mr-2 h-4 w-4" />
                      Create User
                    </>
                  )}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Role Filter */}
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                {ROLES.map((role) => (
                  <SelectItem key={role.id} value={role.name}>
                    {role.description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Success Message */}
      {successMessage !== null && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}

      {/* Error Message */}
      {errorMessage !== null && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>Users ({filteredUsers.length})</CardTitle>
          <CardDescription>
            Manage user accounts and their permissions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center p-8">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No users found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead>Created</TableHead>
                  {canManageUsers && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{user.firstName} {user.lastName}</p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                        {user.mustChangePassword === true && (
                          <Badge variant="outline" className="mt-1">
                            Must change password
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{user.roles?.[0]?.name ?? 'user'}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.isActive ? "default" : "destructive"}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.lastLoginAt !== undefined ? formatDate(user.lastLoginAt) : 'Never'}
                    </TableCell>
                    <TableCell>{formatDate(user.createdAt)}</TableCell>
                    {canManageUsers && (
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditDialog(user)}
                            disabled={isLoading}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          {currentUser !== null && user.id !== currentUser.id && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void handleDeleteUser(user)}
                              disabled={isLoading}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit User Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user information and permissions
            </DialogDescription>
          </DialogHeader>
          {selectedUser !== null && (
            <form onSubmit={(e) => void handleUpdateSubmit(e)} className="space-y-4">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="update-name">Name</Label>
                <Input
                  id="update-name"
                  placeholder="Enter user's full name"
                  value={updateForm.name ?? ''}
                  onChange={(e) => handleUpdateInputChange('name', e.target.value)}
                  disabled={isLoading}
                  className={updateErrors.name !== undefined ? 'border-destructive' : ''}
                />
                {updateErrors.name !== undefined && (
                  <p className="text-sm text-destructive">{updateErrors.name}</p>
                )}
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="update-email">Email</Label>
                <Input
                  id="update-email"
                  type="email"
                  placeholder="Enter user's email address"
                  value={updateForm.email ?? ''}
                  onChange={(e) => handleUpdateInputChange('email', e.target.value)}
                  disabled={isLoading}
                  className={updateErrors.email !== undefined ? 'border-destructive' : ''}
                />
                {updateErrors.email !== undefined && (
                  <p className="text-sm text-destructive">{updateErrors.email}</p>
                )}
              </div>

              {/* Role */}
              <div className="space-y-2">
                <Label htmlFor="update-role">Role</Label>
                <Select
                  value={updateForm.roleId ?? ''}
                  onValueChange={(value) => handleUpdateInputChange('roleId', value)}
                  disabled={isLoading}
                >
                  <SelectTrigger className={updateErrors.roleId !== undefined ? 'border-destructive' : ''}>
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {updateErrors.roleId !== undefined && (
                  <p className="text-sm text-destructive">{updateErrors.roleId}</p>
                )}
              </div>

              {/* Active Status */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="update-isActive"
                  checked={updateForm.isActive ?? false}
                  onCheckedChange={(checked) => handleUpdateInputChange('isActive', checked === true)}
                  disabled={isLoading}
                />
                <Label htmlFor="update-isActive" className="text-sm">
                  Account is active
                </Label>
              </div>

              {/* Must Change Password */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="update-mustChangePassword"
                  checked={updateForm.mustChangePassword ?? false}
                  onCheckedChange={(checked) => handleUpdateInputChange('mustChangePassword', checked === true)}
                  disabled={isLoading}
                />
                <Label htmlFor="update-mustChangePassword" className="text-sm">
                  Require password change on next login
                </Label>
              </div>

              {/* Error Message */}
              {errorMessage !== null && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              )}

              {/* Submit Button */}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating User...
                  </>
                ) : (
                  <>
                    <Edit className="mr-2 h-4 w-4" />
                    Update User
                  </>
                )}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default UserManagement;