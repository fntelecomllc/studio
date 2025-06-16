import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Login - DomainFlow',
  description: 'Sign in to DomainFlow',
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      {children}
    </div>
  );
}