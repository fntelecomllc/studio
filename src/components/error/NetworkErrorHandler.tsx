"use client";

import React, { Component, ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, RefreshCw, LogIn, WifiOff } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Props {
  children: ReactNode;
  onRetry?: () => void;
  onLogin?: () => void;
}

interface State {
  hasNetworkError: boolean;
  hasAuthError: boolean;
  errorType: 'network' | 'auth' | 'api' | null;
  errorMessage: string;
  retryCount: number;
}

class NetworkErrorHandler extends Component<Props, State> {
  private maxRetries = 3;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasNetworkError: false,
      hasAuthError: false,
      errorType: null,
      errorMessage: '',
      retryCount: 0
    };
  }

  override componentDidMount(): void {
    // Listen for unhandled promise rejections (API errors)
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection);
    
    // Listen for network status changes
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
  }

  override componentWillUnmount(): void {
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection);
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
  }

  private handleUnhandledRejection = (event: PromiseRejectionEvent): void => {
    const error: unknown = event.reason;
    
    // Check if this is an API error we should handle
    if (this.isApiError(error)) {
      event.preventDefault(); // Prevent the error from being logged to console
      this.handleApiError(error);
    }
  };

  private handleOnline = (): void => {
    if (this.state.hasNetworkError === true) {
      this.setState({
        hasNetworkError: false,
        errorType: null,
        errorMessage: ''
      });
      
      toast({
        title: "Connection Restored",
        description: "Your internet connection has been restored.",
        variant: "default"
      });
    }
  };

  private handleOffline = (): void => {
    this.setState({
      hasNetworkError: true,
      errorType: 'network',
      errorMessage: 'No internet connection. Please check your network settings.'
    });
    
    toast({
      title: "Connection Lost",
      description: "You appear to be offline. Some features may not work.",
      variant: "destructive"
    });
  };

  private isApiError = (error: unknown): boolean => {
    // Check if this looks like an API error we should handle
    if (typeof error === 'object' && error !== null) {
      const errorObj = error as Record<string, unknown>;
      // Check for common API error patterns
      if (typeof errorObj.status === 'number' && (errorObj.status === 401 || errorObj.status === 403)) return true;
      if (typeof errorObj.message === 'string') {
        if (errorObj.message.includes('401')) return true;
        if (errorObj.message.includes('403')) return true;
        if (errorObj.message.includes('Unauthorized')) return true;
        if (errorObj.message.includes('Authentication')) return true;
        if (errorObj.message.includes('Network Error')) return true;
        if (errorObj.message.includes('Failed to fetch')) return true;
      }
    }
    return false;
  };

  private handleApiError = (error: unknown): void => {
    let errorType: 'network' | 'auth' | 'api' = 'api';
    let errorMessage = 'An unexpected error occurred.';

    // Type guard for error object
    if (typeof error === 'object' && error !== null) {
      const errorObj = error as Record<string, unknown>;
      const status = typeof errorObj.status === 'number' ? errorObj.status : undefined;
      const message = typeof errorObj.message === 'string' ? errorObj.message : undefined;

      // Determine error type and message
      if (status === 401 || status === 403 ||
          (message !== undefined && (message.includes('401') || message.includes('403') ||
           message.includes('Unauthorized') || message.includes('Authentication')))) {
        errorType = 'auth';
        errorMessage = 'Authentication failed. Please log in again.';
      } else if (message !== undefined && (message.includes('Network Error') ||
                 message.includes('Failed to fetch') ||
                 message.includes('ERR_NETWORK'))) {
        errorType = 'network';
        errorMessage = 'Network connection error. Please check your internet connection.';
      }
    }

    this.setState({
      hasNetworkError: errorType === 'network',
      hasAuthError: errorType === 'auth',
      errorType,
      errorMessage,
      retryCount: 0
    });

    // Show appropriate toast
    toast({
      title: errorType === 'auth' ? "Authentication Error" : 
             errorType === 'network' ? "Network Error" : "API Error",
      description: errorMessage,
      variant: "destructive"
    });
  };

  private handleRetry = (): void => {
    if (this.state.retryCount < this.maxRetries) {
      this.setState(prevState => ({
        hasNetworkError: false,
        hasAuthError: false,
        errorType: null,
        errorMessage: '',
        retryCount: prevState.retryCount + 1
      }));

      // Call custom retry handler if provided
      if (this.props.onRetry !== undefined) {
        this.props.onRetry();
      }
      
      // Reload the page as a last resort
      setTimeout(() => {
        if (this.state.retryCount >= this.maxRetries) {
          window.location.reload();
        }
      }, 1000);
    } else {
      window.location.reload();
    }
  };

  private handleLogin = (): void => {
    this.setState({
      hasAuthError: false,
      errorType: null,
      errorMessage: ''
    });

    // Call custom login handler if provided
    if (this.props.onLogin !== undefined) {
      this.props.onLogin();
    } else {
      // Default: redirect to login page
      window.location.href = '/login';
    }
  };

  override render(): React.ReactNode {
    const { hasNetworkError, hasAuthError, errorMessage } = this.state;

    // Show network error overlay
    if (hasNetworkError === true) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <WifiOff className="h-6 w-6 text-red-600" />
              </div>
              <CardTitle className="text-xl text-red-600">
                Connection Problem
              </CardTitle>
            </CardHeader>
            
            <CardContent className="space-y-4">
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Network Error</AlertTitle>
                <AlertDescription>
                  {errorMessage}
                </AlertDescription>
              </Alert>

              <div className="flex flex-col gap-2">
                <Button onClick={this.handleRetry} className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Try Again
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    // Show authentication error overlay
    if (hasAuthError === true) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mb-4">
                <LogIn className="h-6 w-6 text-yellow-600" />
              </div>
              <CardTitle className="text-xl text-yellow-600">
                Authentication Required
              </CardTitle>
            </CardHeader>
            
            <CardContent className="space-y-4">
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Authentication Error</AlertTitle>
                <AlertDescription>
                  {errorMessage}
                </AlertDescription>
              </Alert>

              <div className="flex flex-col gap-2">
                <Button onClick={this.handleLogin} className="flex items-center gap-2">
                  <LogIn className="h-4 w-4" />
                  Log In
                </Button>
                <Button variant="outline" onClick={this.handleRetry} className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Retry
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default NetworkErrorHandler;

// Hook for manually triggering network error handling
export const useNetworkErrorHandler = (): { handleAuthError: () => void; handleNetworkError: () => void } => {
  return {
    handleAuthError: (): void => {
      const event = new CustomEvent('unhandledrejection', {
        detail: { reason: { status: 401, message: 'Authentication failed' } }
      }) as unknown as PromiseRejectionEvent & { reason: unknown };
      event.reason = { status: 401, message: 'Authentication failed' };
      window.dispatchEvent(event);
    },
    handleNetworkError: (): void => {
      const event = new CustomEvent('unhandledrejection', {
        detail: { reason: { message: 'Network Error' } }
      }) as unknown as PromiseRejectionEvent & { reason: unknown };
      event.reason = { message: 'Network Error' };
      window.dispatchEvent(event);
    }
  };
};