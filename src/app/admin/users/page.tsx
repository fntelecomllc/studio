// src/app/admin/users/page.tsx
// Main user management page with enhanced functionality and branded type integration
'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Loader2,
  Plus,
  Edit,
  Trash2,
  Users,
  Search,
  MoreHorizontal,
  UserCheck,
  UserX,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { User, UserListResponse } from '@/lib/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function UserManagementPage() {
  const { 
    user: currentUser, 
    hasPermission, 
    getUsers, 
    updateUser, 
    deleteUser 
  } = useAuth();
  const router = useRouter();

  // State management
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Permissions
  const canManageUsers = hasPermission('users:write') || hasPermission('admin:all');
  const canViewUsers = hasPermission('users:read') || hasPermission('admin:all');

  // Load users with pagination
  const loadUsers = useCallback(async (page = 1, limit = 20) => {
    if (!canViewUsers) return;
    
    setIsLoading(true);
    setErrorMessage(null);
    
    try {
      const result = await getUsers(page, limit);
      if (result.success && result.data) {
        const userData = result.data as UserListResponse;
        setUsers(userData.data || []);
        setTotalUsers(userData.metadata?.page?.total || 0);
        setCurrentPage(userData.metadata?.page?.current || page);
      } else {
        setErrorMessage(result.error?.message || 'Failed to load users');
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
    loadUsers();
  }, [loadUsers]);

  // Handle user status toggle
  const handleToggleUserStatus = useCallback(async (user: User) => {
    if (!canManageUsers) return;

    try {
      setIsLoading(true);
      const result = await updateUser(user.id, {
        isActive: !user.isActive
      });

      if (result.success) {
        setSuccessMessage(`User ${user.isActive ? 'deactivated' : 'activated'} successfully`);
        await loadUsers(currentPage);
      } else {
        setErrorMessage(result.error?.message || 'Failed to update user status');
      }
    } catch (error) {
      console.error('Toggle user status error:', error);
      setErrorMessage('An unexpected error occurred while updating user status');
    } finally {
      setIsLoading(false);
    }
  }, [canManageUsers, updateUser, loadUsers, currentPage]);

  // Handle user deletion
  const handleDeleteUser = useCallback(async (user: User) => {
    if (!canManageUsers) return;
    if (user.id === currentUser?.id) {
      setErrorMessage('You cannot delete your own account');
      return;
    }

    if (!confirm(`Are you sure you want to delete user "${user.firstName} ${user.lastName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setIsLoading(true);
      const result = await deleteUser(user.id);

      if (result.success) {
        setSuccessMessage('User deleted successfully');
        await loadUsers(currentPage);
      } else {
        setErrorMessage(result.error?.message || 'Failed to delete user');
      }
    } catch (error) {
      console.error('Delete user error:', error);
      setErrorMessage('An unexpected error occurred while deleting user');
    } finally {
      setIsLoading(false);
    }
  }, [canManageUsers, deleteUser, loadUsers, currentPage, currentUser?.id]);

  // Filter users based on search term
  const filteredUsers = users.filter(user => 
    user.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Clear messages after timeout
  useEffect(() => {
    if (successMessage || errorMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage(null);
        setErrorMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
    // Return undefined for cases where no timer is set
    return undefined;
  }, [successMessage, errorMessage]);

  if (!canViewUsers) {
    return (
      <div className="container mx-auto p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You don&apos;t have permission to view users.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-8 w-8" />
            User Management
          </h1>
          <p className="text-muted-foreground">
            Manage user accounts, permissions, and access controls.
          </p>
        </div>
        
        {canManageUsers && (
          <Link href="/admin/users/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create User
            </Button>
          </Link>
        )}
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

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Search Users</CardTitle>
          <CardDescription>
            Search by name or email address
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>Users ({totalUsers})</CardTitle>
          <CardDescription>
            All user accounts in the system
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="ml-2">Loading users...</span>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold">No users found</h3>
              <p className="text-muted-foreground">
                {searchTerm ? 'Try adjusting your search criteria.' : 'No users have been created yet.'}
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <div>
                            <div className="font-medium">
                              {user.firstName} {user.lastName}
                            </div>
                            {user.id === currentUser?.id && (
                              <Badge variant="secondary" className="text-xs">You</Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <span>{user.email}</span>
                          {user.emailVerified ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-yellow-500" />
                          )}
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {user.roles?.map((role) => (
                            <Badge key={role.id} variant="outline" className="text-xs">
                              {role.name}
                            </Badge>
                          )) || <span className="text-muted-foreground">No roles</span>}
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          {user.isActive ? (
                            <Badge variant="default" className="bg-green-500">
                              <UserCheck className="h-3 w-3 mr-1" />
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              <UserX className="h-3 w-3 mr-1" />
                              Inactive
                            </Badge>
                          )}
                          {user.isLocked && (
                            <Badge variant="outline" className="border-red-500 text-red-500">
                              Locked
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        {user.lastLoginAt ? (
                          <span className="text-sm text-muted-foreground">
                            {new Date(user.lastLoginAt).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">Never</span>
                        )}
                      </TableCell>
                      
                      <TableCell className="text-right">
                        {canManageUsers && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuItem
                                onClick={() => router.push(`/admin/users/${user.id}/edit`)}
                              >
                                <Edit className="mr-2 h-4 w-4" />
                                Edit User
                              </DropdownMenuItem>
                              
                              <DropdownMenuSeparator />
                              
                              <DropdownMenuItem
                                onClick={() => handleToggleUserStatus(user)}
                                disabled={user.id === currentUser?.id}
                              >
                                {user.isActive ? (
                                  <>
                                    <UserX className="mr-2 h-4 w-4" />
                                    Deactivate
                                  </>
                                ) : (
                                  <>
                                    <UserCheck className="mr-2 h-4 w-4" />
                                    Activate
                                  </>
                                )}
                              </DropdownMenuItem>
                              
                              <DropdownMenuSeparator />
                              
                              <DropdownMenuItem
                                onClick={() => handleDeleteUser(user)}
                                disabled={user.id === currentUser?.id}
                                className="text-red-600"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete User
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {filteredUsers.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {filteredUsers.length} of {totalUsers} users
          </p>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadUsers(currentPage - 1)}
              disabled={currentPage <= 1 || isLoading}
            >
              Previous
            </Button>
            <span className="text-sm">
              Page {currentPage}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadUsers(currentPage + 1)}
              disabled={filteredUsers.length < 20 || isLoading}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
