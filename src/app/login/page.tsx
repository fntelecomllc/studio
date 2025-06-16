// src/app/login/page.tsx
// Login page with authentication flow
'use client';

import { LoginForm } from '@/components/auth/LoginForm';
import { Suspense } from 'react';

function LoginPageContent() {
  return (
    <div className="min-h-screen bg-background">
      <LoginForm 
        title="Welcome back to DomainFlow"
        description="Sign in to your account to continue"
        showSignUpLink={true}
        showForgotPassword={true}
      />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    }>
      <LoginPageContent />
    </Suspense>
  );
}