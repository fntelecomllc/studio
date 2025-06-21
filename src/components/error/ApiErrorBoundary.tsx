// src/components/error/ApiErrorBoundary.tsx
// Enhanced error boundary specifically for API route mismatches and errors
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, RefreshCw, Bug, ExternalLink } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  isApiError: boolean;
  errorDetails: {
    type: string;
    status?: number;
    endpoint?: string;
    message: string;
    suggestions: string[];
  } | null;
}

class ApiErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      isApiError: false,
      errorDetails: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Analyze error to determine if it's API-related
    const isApiError = ApiErrorBoundary.isApiRelatedError(error);
    const errorDetails = isApiError ? ApiErrorBoundary.analyzeApiError(error) : null;

    return {
      hasError: true,
      error,
      isApiError,
      errorDetails
    };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ApiErrorBoundary caught an error:', error, errorInfo);
    
    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    this.setState({
      errorInfo
    });

    // Log API errors with additional context
    if (this.state.isApiError) {
      console.group('🚨 API Error Details');
      console.error('Error:', error);
      console.error('Error Info:', errorInfo);
      console.error('Error Details:', this.state.errorDetails);
      console.groupEnd();
    }
  }

  static isApiRelatedError(error: Error): boolean {
    const errorMessage = error.message.toLowerCase();
    const apiKeywords = [
      'fetch',
      'network',
      'api',
      'endpoint',
      'route',
      '404',
      '401',
      '403',
      '500',
      'cors',
      'timeout',
      'connection'
    ];

    return apiKeywords.some(keyword => errorMessage.includes(keyword)) ||
           error.name === 'TypeError' && errorMessage.includes('fetch') ||
           error.stack?.includes('/api/') ||
           false;
  }

  static analyzeApiError(error: Error): State['errorDetails'] {
    const message = error.message;
    const stack = error.stack || '';

    // Extract status code if present
    const statusMatch = message.match(/(\d{3})/);
    const status = statusMatch && statusMatch[1] ? parseInt(statusMatch[1]) : undefined;

    // Extract endpoint if present
    const endpointMatch = stack.match(/\/api\/[^\s)]+/) || message.match(/\/api\/[^\s)]+/);
    const endpoint = endpointMatch ? endpointMatch[0] : undefined;

    // Determine error type and suggestions
    let type = 'Unknown API Error';
    let suggestions: string[] = [];

    if (status === 404) {
      type = 'Route Not Found';
      suggestions = [
        'Check if the API endpoint exists in the backend',
        'Verify the route path matches backend route definitions',
        'Ensure the correct API version (v1/v2) is being used',
        'Check for missing /api prefix in the request URL'
      ];
    } else if (status === 401) {
      type = 'Authentication Error';
      suggestions = [
        'Log in again to refresh your session',
        'Check if your session has expired',
        'Verify authentication tokens are being sent correctly'
      ];
    } else if (status === 403) {
      type = 'Permission Denied';
      suggestions = [
        'Check if you have the required permissions',
        'Contact an administrator for access',
        'Verify your user role allows this action'
      ];
    } else if (status && status >= 500) {
      type = 'Server Error';
      suggestions = [
        'Try again in a few moments',
        'Check if the backend server is running',
        'Contact support if the problem persists'
      ];
    } else if (message.includes('fetch')) {
      type = 'Network Error';
      suggestions = [
        'Check your internet connection',
        'Verify the API server is accessible',
        'Check for CORS configuration issues'
      ];
    } else if (message.includes('timeout')) {
      type = 'Request Timeout';
      suggestions = [
        'Try again with a slower connection',
        'Check if the server is responding slowly',
        'Verify network stability'
      ];
    }

    return {
      type,
      status,
      endpoint,
      message,
      suggestions
    };
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      isApiError: false,
      errorDetails: null
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  override render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { error, errorDetails, isApiError } = this.state;

      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
          <Card className="w-full max-w-2xl">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-6 w-6 text-red-500" />
                <CardTitle className="text-red-700">
                  {isApiError ? 'API Error Detected' : 'Application Error'}
                </CardTitle>
              </div>
              <CardDescription>
                {isApiError 
                  ? 'There was a problem communicating with the server.'
                  : 'An unexpected error occurred in the application.'
                }
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Error Details */}
              {errorDetails && (
                <Alert>
                  <Bug className="h-4 w-4" />
                  <AlertTitle className="flex items-center gap-2">
                    {errorDetails.type}
                    {errorDetails.status && (
                      <Badge variant="destructive">
                        {errorDetails.status}
                      </Badge>
                    )}
                  </AlertTitle>
                  <AlertDescription className="mt-2">
                    <div className="space-y-2">
                      <p className="font-medium">{errorDetails.message}</p>
                      {errorDetails.endpoint && (
                        <p className="text-sm text-gray-600">
                          <strong>Endpoint:</strong> <code className="bg-gray-100 px-1 rounded">{errorDetails.endpoint}</code>
                        </p>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Suggestions */}
              {errorDetails?.suggestions && errorDetails.suggestions.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-medium text-blue-900 mb-2">Suggested Solutions:</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm text-blue-800">
                    {errorDetails.suggestions.map((suggestion, index) => (
                      <li key={index}>{suggestion}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Technical Details (Development Mode) */}
              {process.env.NODE_ENV === 'development' && error && (
                <details className="bg-gray-100 border rounded-lg p-4">
                  <summary className="cursor-pointer font-medium text-gray-700 mb-2">
                    Technical Details (Development)
                  </summary>
                  <div className="space-y-2 text-sm">
                    <div>
                      <strong>Error:</strong>
                      <pre className="bg-white p-2 rounded border mt-1 overflow-auto text-xs">
                        {error.message}
                      </pre>
                    </div>
                    {error.stack && (
                      <div>
                        <strong>Stack Trace:</strong>
                        <pre className="bg-white p-2 rounded border mt-1 overflow-auto text-xs max-h-40">
                          {error.stack}
                        </pre>
                      </div>
                    )}
                  </div>
                </details>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2 pt-4">
                <Button onClick={this.handleRetry} className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Try Again
                </Button>
                <Button variant="outline" onClick={this.handleReload} className="flex items-center gap-2">
                  <ExternalLink className="h-4 w-4" />
                  Reload Page
                </Button>
              </div>

              {/* Help Text */}
              <div className="text-sm text-gray-600 pt-2 border-t">
                <p>
                  If this problem persists, please contact support with the error details above.
                  {isApiError && ' This appears to be an API connectivity issue.'}
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

export default ApiErrorBoundary;

// Hook for handling API errors in functional components
export function useApiErrorHandler() {
  const handleApiError = (error: unknown) => {
    console.error('API Error:', error);
    
    // You can add custom error handling logic here
    // such as showing toast notifications, logging to external services, etc.
    
    if (error && typeof error === 'object' && 'status' in error && (error as { status: number }).status === 404) {
      console.warn('Route mismatch detected:', error);
    }
  };

  return { handleApiError };
}

// Utility function to wrap API calls with error handling
export function withApiErrorHandling<T extends (...args: unknown[]) => Promise<unknown>>(
  apiFunction: T
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await apiFunction(...args);
    } catch {
      console.error('API call failed:', error);
      
      // Re-throw with additional context
      if (error instanceof Error) {
        const enhancedError = new Error(`API Error: ${error.message}`);
        enhancedError.stack = error.stack;
        throw enhancedError;
      }
      
      throw error;
    }
  }) as T;
}