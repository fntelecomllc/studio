// src/app/admin/page.tsx
// Admin dashboard with overview and quick actions
'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Shield, Settings, Activity } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

export default function AdminDashboard() {
  const { user, hasPermission } = useAuth();

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Administration</h1>
        <p className="text-muted-foreground">
          Manage users, system settings, and monitor platform activity.
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">--</div>
            <p className="text-xs text-muted-foreground">
              Active and inactive users
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Sessions</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">--</div>
            <p className="text-xs text-muted-foreground">
              Currently logged in users
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Security Events</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">--</div>
            <p className="text-xs text-muted-foreground">
              Last 24 hours
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Status</CardTitle>
            <Settings className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">Online</div>
            <p className="text-xs text-muted-foreground">
              All services operational
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Admin Actions */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {hasPermission('users:read') && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                User Management
              </CardTitle>
              <CardDescription>
                Create, edit, and manage user accounts and permissions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                <Link href="/admin/users">
                  <Button className="w-full">Manage Users</Button>
                </Link>
                {hasPermission('users:write') && (
                  <Link href="/admin/users/new">
                    <Button variant="outline" className="w-full">
                      Create New User
                    </Button>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {hasPermission('security:read') && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Security Center
              </CardTitle>
              <CardDescription>
                Monitor security events and audit logs.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                <Button className="w-full" disabled>
                  View Audit Logs
                </Button>
                <Button variant="outline" className="w-full" disabled>
                  Security Reports
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {hasPermission('system:config') && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                System Settings
              </CardTitle>
              <CardDescription>
                Configure system-wide settings and preferences.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                <Button className="w-full" disabled>
                  Global Settings
                </Button>
                <Button variant="outline" className="w-full" disabled>
                  Feature Flags
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Current User Info */}
      <Card>
        <CardHeader>
          <CardTitle>Current Session</CardTitle>
          <CardDescription>
            Your current administrative session information.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between">
              <span className="font-medium">User:</span>
              <span>{user?.firstName} {user?.lastName} ({user?.email})</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Role:</span>
              <span>{user?.roles?.map(role => role.name).join(', ') || 'Unknown'}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Permissions:</span>
              <span>
                {hasPermission('admin:all') ? 'Full Admin' : 
                 hasPermission('users:write') ? 'User Management' : 
                 hasPermission('users:read') ? 'Read Only' : 'Limited'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
