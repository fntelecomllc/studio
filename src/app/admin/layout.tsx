// src/app/admin/layout.tsx
// Admin section layout with proper protection and navigation
'use client';

import { StrictProtectedRoute } from '@/components/auth/StrictProtectedRoute';

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <StrictProtectedRoute 
      requiredPermissions={['admin:all', 'users:read']} 
      requireAllPermissions={false}
    >
      <div className="admin-layout">
        {children}
      </div>
    </StrictProtectedRoute>
  );
}
