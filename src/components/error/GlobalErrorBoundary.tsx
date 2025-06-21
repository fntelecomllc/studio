"use client";

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  retryCount: number;
}

class GlobalErrorBoundary extends Component<Props, State> {
  private maxRetries = 3;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error
    };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('GlobalErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo
    });

    // Call custom error handler if provided
    if (this.props.onError !== undefined) {
      this.props.onError(error, errorInfo);
    }

    // Log error to external service (without exposing sensitive data)
    this.logErrorToService(error, errorInfo);

    // Show toast notification
    toast({
      title: "Application Error",
      description: "An unexpected error occurred. Please try refreshing the page.",
      variant: "destructive"
    });
  }

  private logErrorToService = (error: Error, errorInfo: ErrorInfo): void => {
    // In a real application, you would send this to your error tracking service
    // Make sure to sanitize any sensitive information
    const sanitizedError = {
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 10).join('\n'), // Limit stack trace
      componentStack: errorInfo.componentStack?.split('\n').slice(0, 5).join('\n'),
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      // Don't include any user data or sensitive information
    };

    console.log('Error logged:', sanitizedError);
    
    // Example: Send to error tracking service
    // errorTrackingService.captureException(sanitizedError);
  };

  private handleRetry = (): void => {
    if (this.state.retryCount < this.maxRetries) {
      this.setState(prevState => ({
        hasError: false,
        error: null,
        errorInfo: null,
        retryCount: prevState.retryCount + 1
      }));
    } else {
      // Max retries reached, suggest page refresh
      window.location.reload();
    }
  };

  private handleGoHome = (): void => {
    window.location.href = '/';
  };

  private handleReportBug = (): void => {
    const errorDetails = {
      message: this.state.error?.message ?? 'Unknown error',
      stack: this.state.error?.stack ?? 'No stack trace',
      timestamp: new Date().toISOString(),
      url: window.location.href
    };

    // In a real app, this would open a bug report form or send to support
    const mailtoLink = `mailto:support@domainflow.com?subject=Bug Report&body=${encodeURIComponent(
      `Error Details:\n${JSON.stringify(errorDetails, null, 2)}`
    )}`;
    
    window.open(mailtoLink);
  };

  private getErrorMessage = (error: Error): string => {
    // Provide user-friendly error messages for common errors
    if (error.message.includes('ChunkLoadError')) {
      return 'Failed to load application resources. Please refresh the page.';
    }
    
    if (error.message.includes('Network Error')) {
      return 'Network connection issue. Please check your internet connection and try again.';
    }
    
    if (error.message.includes('Authentication')) {
      return 'Authentication error. Please log in again.';
    }
    
    if (error.message.includes('Permission')) {
      return 'You do not have permission to perform this action.';
    }
    
    // Generic fallback
    return 'An unexpected error occurred. Our team has been notified.';
  };

  override render(): React.ReactNode {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback !== undefined) {
        return this.props.fallback;
      }

      const canRetry = this.state.retryCount < this.maxRetries;
      const errorMessage = this.state.error !== null ? this.getErrorMessage(this.state.error) : 'Unknown error occurred';

      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <CardTitle className="text-2xl text-red-600">
                Oops! Something went wrong
              </CardTitle>
            </CardHeader>
            
            <CardContent className="space-y-6">
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Error Details</AlertTitle>
                <AlertDescription>
                  {errorMessage}
                </AlertDescription>
              </Alert>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                {canRetry === true && (
                  <Button onClick={this.handleRetry} className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" />
                    Try Again ({this.maxRetries - this.state.retryCount} attempts left)
                  </Button>
                )}
                
                {canRetry === false && (
                  <Button onClick={() => { window.location.reload(); }} className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" />
                    Refresh Page
                  </Button>
                )}
                
                <Button variant="outline" onClick={this.handleGoHome} className="flex items-center gap-2">
                  <Home className="h-4 w-4" />
                  Go Home
                </Button>
                
                <Button variant="outline" onClick={this.handleReportBug} className="flex items-center gap-2">
                  <Bug className="h-4 w-4" />
                  Report Bug
                </Button>
              </div>

              {/* Technical Details (only in development) */}
              {process.env.NODE_ENV === 'development' && this.state.error !== null && (
                <details className="mt-6">
                  <summary className="cursor-pointer text-sm font-medium text-gray-600 hover:text-gray-800">
                    Technical Details (Development Only)
                  </summary>
                  <div className="mt-2 p-4 bg-gray-100 rounded-md">
                    <div className="text-sm">
                      <div className="font-medium text-red-600 mb-2">Error:</div>
                      <pre className="whitespace-pre-wrap text-xs text-gray-800 mb-4">
                        {this.state.error.message}
                      </pre>
                      
                      {this.state.error.stack !== undefined && (
                        <>
                          <div className="font-medium text-red-600 mb-2">Stack Trace:</div>
                          <pre className="whitespace-pre-wrap text-xs text-gray-600 mb-4 max-h-40 overflow-y-auto">
                            {this.state.error.stack}
                          </pre>
                        </>
                      )}
                      
                      {this.state.errorInfo?.componentStack !== undefined && (
                        <>
                          <div className="font-medium text-red-600 mb-2">Component Stack:</div>
                          <pre className="whitespace-pre-wrap text-xs text-gray-600 max-h-40 overflow-y-auto">
                            {this.state.errorInfo.componentStack}
                          </pre>
                        </>
                      )}
                    </div>
                  </div>
                </details>
              )}

              {/* Help Text */}
              <div className="text-center text-sm text-gray-600">
                <p>
                  If this problem persists, please contact our support team at{' '}
                  <a href="mailto:support@domainflow.com" className="text-blue-600 hover:underline">
                    support@domainflow.com
                  </a>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default GlobalErrorBoundary;

// Hook for functional components to trigger error boundary
export const useErrorHandler = (): ((error: Error) => never) => {
  return (error: Error): never => {
    // This will trigger the error boundary
    throw error;
  };
};

// Higher-order component for wrapping components with error boundary
export const withErrorBoundary = <P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode,
  onError?: (error: Error, errorInfo: ErrorInfo) => void
): React.ComponentType<P> => {
  const WrappedComponent = (props: P): React.ReactElement => (
    <GlobalErrorBoundary fallback={fallback} onError={onError}>
      <Component {...props} />
    </GlobalErrorBoundary>
  );
  
  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName ?? Component.name})`;
  
  return WrappedComponent;
};