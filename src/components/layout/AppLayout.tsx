'use client';

import React, { useEffect, useState, memo, useMemo, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { WebSocketStatusProvider } from '@/contexts/WebSocketStatusContext';
import { SidebarProvider, Sidebar, SidebarContent, SidebarHeader, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger } from '@/components/ui/sidebar';
import { Home, Target, Users, Settings, Zap, Database, Shield, LogOut } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { MemoryMonitor } from '@/lib/hooks/useMemoryMonitoring';
import { websocketService } from '@/lib/services/websocketService.simple';

interface AppLayoutProps {
  children: React.ReactNode;
}

// Navigation menu items
const navigationItems = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: Home,
    permission: null
  },
  {
    title: "Campaigns",
    url: "/campaigns",
    icon: Target,
    permission: "campaigns:read"
  },
  {
    title: "Personas",
    url: "/personas",
    icon: Users,
    permission: "personas:read"
  },
  {
    title: "Proxies",
    url: "/proxies",
    icon: Zap,
    permission: "proxies:read"
  },
  {
    title: "Keywords",
    url: "/keywords",
    icon: Database,
    permission: "campaigns:read"
  },
  {
    title: "Admin",
    url: "/admin",
    icon: Shield,
    permission: "admin:all"
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
    permission: "system:config"
  }
];

// Memoized sidebar component to prevent unnecessary re-renders
const AppSidebar = memo(() => {
  const { user, hasPermission, logout, isLoading, isAuthenticated, isInitialized } = useAuth();

  // ENTERPRISE AUTH FIX: Wait for auth to be fully ready before filtering menu items
  // This prevents empty sidebar when permissions load after component render
  const filteredItems = useMemo(() => {
    // Show only Dashboard while auth is loading
    if (isLoading || !isInitialized || !isAuthenticated || !user) {
      const dashboardItem = navigationItems.find(item => item.title === "Dashboard");
      return dashboardItem ? [dashboardItem] : [];
    }
    
    return navigationItems.filter(item => {
      if (!item.permission) return true;
      return hasPermission(item.permission);
    });
  }, [hasPermission, isLoading, isInitialized, isAuthenticated, user]);

  // Memoize logout handler to prevent re-creation on every render
  const handleLogout = useCallback(() => {
    logout();
  }, [logout]);

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <Shield className="w-6 h-6 text-primary" />
          <h2 className="text-lg font-semibold">DomainFlow</h2>
        </div>
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <Link href={item.url} className="flex items-center gap-3">
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      
      <SidebarFooter className="p-4 border-t">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-sm font-medium">{user?.email}</span>
            <span className="text-xs text-muted-foreground">
              {user?.roles.map(role => role.displayName).join(', ')}
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 rounded-md hover:bg-accent"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
});

AppSidebar.displayName = 'AppSidebar';

// Memoized main layout component for optimal performance
const AppLayout = memo(({ children }: AppLayoutProps) => {
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  // Optimized mounting effect with proper cleanup
  useEffect(() => {
    setMounted(true);
    
    // Return cleanup function to handle unmounting
    return () => {
      setMounted(false);
    };
  }, []); // Empty dependency array - only runs once on mount/unmount

  // Optimized auth service initialization with proper error handling and cleanup
  useEffect(() => {
    let isActive = true; // Flag to prevent state updates if component unmounts
    
    console.log('[AppLayout] 🚀 Initializing auth service...');
    
    const initializeAuthService = async () => {
      try {
        const { authService } = await import('@/lib/services/authService');
        
        // Only proceed if component is still mounted
        if (isActive) {
          await authService.initialize();
          console.log('[AppLayout] ✅ Auth service initialization complete');
        }
      } catch {
        if (isActive) {
          console.error('[AppLayout] ❌ Auth service initialization failed:', error);
        }
      }
    };

    initializeAuthService();

    // Cleanup function to prevent memory leaks
    return () => {
      isActive = false;
    };
  }, []); // Empty dependency array - only runs once on mount

  // Optimized WebSocket cleanup with proper lifecycle management
  useEffect(() => {
    // Setup function (if needed in the future)
    const setupWebSocketServices = () => {
      // WebSocket services are already initialized elsewhere
      // This effect is primarily for cleanup
    };

    setupWebSocketServices();

    // Cleanup function for WebSocket services
    return () => {
      console.log('[AppLayout] Cleaning up global WebSocket services');
      try {
        websocketService.disconnectAll();
      } catch {
        console.error('[AppLayout] Error during WebSocket cleanup:', error);
      }
    };
  }, []); // Empty dependency array - cleanup only on unmount

  // SECURITY: Isolated routes that should bypass the main app layout
  const isolatedRoutes = ['/dbgui'];
  const isIsolatedRoute = isolatedRoutes.some(route => pathname?.startsWith(route));

  // If this is an isolated route (like dbgui), render children directly without any app layout
  if (isIsolatedRoute) {
    console.log('[AppLayout] 🔒 SECURITY: Isolated route detected, bypassing main app layout:', pathname);
    return <>{children}</>;
  }

  return (
    <WebSocketStatusProvider>
      <SidebarProvider>
        <div className="min-h-screen bg-background flex" suppressHydrationWarning>
          {/* Performance optimized conditional rendering - only after mount */}
          {mounted && (
            <>
              <MemoryMonitor position="bottom-right" />
            </>
          )}
          
          <AppSidebar />
          
          {/* Main content area with optimized structure */}
          <main className="flex-1 flex flex-col">
            <div className="p-4 border-b">
              <SidebarTrigger className="lg:hidden" />
            </div>
            <div className="flex-1 p-6">
              {children}
            </div>
          </main>
        </div>
      </SidebarProvider>
    </WebSocketStatusProvider>
  );
});

AppLayout.displayName = 'AppLayout';

export default AppLayout;