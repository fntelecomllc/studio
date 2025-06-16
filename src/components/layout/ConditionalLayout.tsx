'use client';

import { usePathname } from 'next/navigation';
import AppLayout from './AppLayout';

interface ConditionalLayoutProps {
  children: React.ReactNode;
}

export default function ConditionalLayout({ children }: ConditionalLayoutProps) {
  const pathname = usePathname();
  
  // Pages that should NOT use AppLayout (no sidebar/navigation)
  const excludedPaths = ['/login', '/signup', '/forgot-password', '/reset-password'];
  
  const shouldExcludeLayout = excludedPaths.includes(pathname);
  
  if (shouldExcludeLayout) {
    // Return children without AppLayout wrapper
    return <>{children}</>;
  }
  
  // Return children wrapped with AppLayout for all other pages
  return (
    <AppLayout>
      {children}
    </AppLayout>
  );
}