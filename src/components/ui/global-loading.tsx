/**
 * Global Loading Indicator
 * 
 * Displays a subtle progress bar at the top of the page
 * when any async operations are in progress.
 */

"use client";

import * as React from 'react';
import { useLoadingStore } from '@/lib/stores/loadingStore';
import { cn } from '@/lib/utils';

export const GlobalLoadingIndicator: React.FC = () => {
  const { hasAnyLoading, getLoadingOperations } = useLoadingStore();
  const isLoading = hasAnyLoading();
  const loadingOperations = getLoadingOperations();
  
  // Don't render if nothing is loading
  if (!isLoading || loadingOperations.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      <div className={cn(
        "h-1 bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300",
        "animate-pulse"
      )} />
      
      {/* Optional: Show loading operation names */}
      {loadingOperations.length > 0 && (
        <div className="absolute top-1 right-4 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded-b">
          {loadingOperations.length === 1 ? (
            <span>Loading...</span>
          ) : (
            <span>{loadingOperations.length} operations</span>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Loading Overlay for specific components
 */
interface LoadingOverlayProps {
  isLoading: boolean;
  message?: string;
  children: React.ReactNode;
  className?: string;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  isLoading,
  message = "Loading...",
  children,
  className
}) => {
  return (
    <div className={cn("relative", className)}>
      {children}
      {isLoading && (
        <div className="absolute inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center z-40">
          <div className="bg-card border rounded-lg p-4 shadow-lg flex items-center space-x-3">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
            <span className="text-sm font-medium">{message}</span>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Loading Button that shows loading state
 */
interface LoadingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading: boolean;
  loadingText?: string;
  children: React.ReactNode;
}

export const LoadingButton: React.FC<LoadingButtonProps> = ({
  isLoading,
  loadingText = "Loading...",
  children,
  disabled,
  className,
  ...props
}) => {
  return (
    <button
      {...props}
      disabled={disabled || isLoading}
      className={cn(
        "inline-flex items-center justify-center space-x-2",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
    >
      {isLoading && (
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
      )}
      <span>{isLoading ? loadingText : children}</span>
    </button>
  );
};
