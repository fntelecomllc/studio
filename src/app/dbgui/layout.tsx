// src/app/dbgui/layout.tsx
// Dedicated layout for database GUI - completely isolated from main app layout for security
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'DomainFlow Database Console',
  description: 'Secure database administration interface',
};

export default function DatabaseGUILayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Return children directly without any app layout wrapper
  // This ensures complete isolation from the main application
  return children;
}