/**
 * Lazy loading utilities for performance optimization
 * 
 * Provides efficient loading strategies for large datasets and heavy components
 */

import React, { useRef, useState, useEffect, useCallback, MutableRefObject } from 'react';
import { monitoringService } from '@/lib/monitoring/monitoring-service';

/**
 * Options for lazy loading
 */
export interface LazyLoadOptions {
  /** Root element for intersection observer */
  root?: Element | null;
  /** Margin around root */
  rootMargin?: string;
  /** Threshold for intersection */
  threshold?: number | number[];
  /** Callback when element becomes visible */
  onVisible?: () => void;
  /** Whether to unobserve after first visibility */
  unobserveOnVisible?: boolean;
}

/**
 * Hook for lazy loading elements using Intersection Observer
 */
export function useLazyLoad<T extends HTMLElement = HTMLElement>(
  options: LazyLoadOptions = {}
): [MutableRefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (!ref.current) return;

    const element = ref.current;
    const {
      root = null,
      rootMargin = '50px',
      threshold = 0,
      onVisible,
      unobserveOnVisible = true
    } = options;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            onVisible?.();
            
            if (unobserveOnVisible && observerRef.current) {
              observerRef.current.unobserve(element);
            }
          }
        });
      },
      { root, rootMargin, threshold }
    );

    observerRef.current.observe(element);

    return () => {
      if (observerRef.current && element) {
        observerRef.current.unobserve(element);
      }
    };
  }, [options]);

  return [ref, isVisible];
}

/**
 * Virtualized list configuration
 */
export interface VirtualListConfig<T> {
  /** All items in the list */
  items: T[];
  /** Height of each item */
  itemHeight: number;
  /** Height of the container */
  containerHeight: number;
  /** Buffer size for overscan */
  overscan?: number;
  /** Callback to get item key */
  getItemKey?: (item: T, index: number) => string | number;
}

/**
 * Hook for virtual scrolling
 */
export function useVirtualList<T>({
  items,
  itemHeight,
  containerHeight,
  overscan = 3,
  getItemKey
}: VirtualListConfig<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const visibleRange = {
    start: Math.max(0, Math.floor(scrollTop / itemHeight) - overscan),
    end: Math.min(
      items.length,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
    )
  };

  const visibleItems = items.slice(visibleRange.start, visibleRange.end);
  const totalHeight = items.length * itemHeight;
  const offsetY = visibleRange.start * itemHeight;

  const handleScroll = useCallback((e: Event) => {
    const target = e.target as HTMLDivElement;
    setScrollTop(target.scrollTop);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  return {
    containerRef,
    visibleItems,
    totalHeight,
    offsetY,
    visibleRange,
    getItemKey: getItemKey || ((item: T, index: number) => index)
  };
}

/**
 * Pagination configuration
 */
export interface PaginationConfig {
  /** Total number of items */
  totalItems: number;
  /** Items per page */
  itemsPerPage: number;
  /** Current page (1-indexed) */
  currentPage: number;
}

/**
 * Hook for pagination
 */
export function usePagination({
  totalItems,
  itemsPerPage,
  currentPage
}: PaginationConfig) {
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);

  const hasNextPage = currentPage < totalPages;
  const hasPreviousPage = currentPage > 1;

  return {
    totalPages,
    startIndex,
    endIndex,
    hasNextPage,
    hasPreviousPage,
    pageRange: Array.from({ length: totalPages }, (_, i) => i + 1)
  };
}

/**
 * Infinite scroll configuration
 */
export interface InfiniteScrollConfig {
  /** Function to load more items */
  loadMore: () => Promise<void>;
  /** Whether more items are available */
  hasMore: boolean;
  /** Whether loading is in progress */
  isLoading: boolean;
  /** Threshold in pixels from bottom to trigger load */
  threshold?: number;
  /** Root element for scroll detection */
  root?: Element | null;
}

/**
 * Hook for infinite scrolling
 */
export function useInfiniteScroll({
  loadMore,
  hasMore,
  isLoading,
  threshold = 100,
  root = null
}: InfiniteScrollConfig) {
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    if (!hasMore || isLoading) return;

    const observer = new IntersectionObserver(
      async (entries) => {
        const target = entries[0];
        if (target && target.isIntersecting && !loadingRef.current) {
          loadingRef.current = true;
          const timer = monitoringService.createTimer();
          
          try {
            await loadMore();
            monitoringService.recordCustomMetric(
              'infinite_scroll_load',
              timer.end(),
              'ms'
            );
          } catch (error) {
            monitoringService.recordError(
              error as Error,
              'infinite_scroll_load_error'
            );
          } finally {
            loadingRef.current = false;
          }
        }
      },
      {
        root,
        rootMargin: `${threshold}px`
      }
    );

    const currentLoadMoreRef = loadMoreRef.current;
    if (currentLoadMoreRef) {
      observer.observe(currentLoadMoreRef);
    }

    return () => {
      if (currentLoadMoreRef) {
        observer.unobserve(currentLoadMoreRef);
      }
    };
  }, [loadMore, hasMore, isLoading, threshold, root]);

  return { loadMoreRef };
}

/**
 * Progressive image loading configuration
 */
export interface ProgressiveImageConfig {
  /** Low quality placeholder source */
  placeholderSrc?: string;
  /** Full quality image source */
  src: string;
  /** Alt text for accessibility */
  alt: string;
  /** Loading strategy */
  loading?: 'lazy' | 'eager';
  /** Callback when image loads */
  onLoad?: () => void;
  /** Callback on error */
  onError?: () => void;
}

/**
 * Hook for progressive image loading
 */
export function useProgressiveImage({
  placeholderSrc,
  src,
  onLoad,
  onError
}: ProgressiveImageConfig) {
  const [currentSrc, setCurrentSrc] = useState(placeholderSrc || src);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const img = new Image();
    
    img.onload = () => {
      setCurrentSrc(src);
      setIsLoading(false);
      onLoad?.();
    };
    
    img.onerror = () => {
      const error = new Error(`Failed to load image: ${src}`);
      setError(error);
      setIsLoading(false);
      onError?.();
      monitoringService.recordError(error, 'progressive_image_load_error');
    };
    
    img.src = src;
    
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [src, onLoad, onError]);

  return {
    currentSrc,
    isLoading,
    error,
    isPlaceholder: currentSrc === placeholderSrc
  };
}

/**
 * Chunk loading configuration
 */
export interface ChunkLoadConfig<T> {
  /** All data to be chunked */
  data: T[];
  /** Size of each chunk */
  chunkSize: number;
  /** Delay between chunk loads in ms */
  delay?: number;
  /** Callback when chunk is loaded */
  onChunkLoad?: (chunk: T[], index: number) => void;
}

/**
 * Hook for loading data in chunks
 */
export function useChunkLoader<T>({
  data,
  chunkSize,
  delay = 0,
  onChunkLoad
}: ChunkLoadConfig<T>) {
  const [loadedData, setLoadedData] = useState<T[]>([]);
  const [currentChunk, setCurrentChunk] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const totalChunks = Math.ceil(data.length / chunkSize);

  const loadNextChunk = useCallback(async () => {
    if (currentChunk >= totalChunks || isLoading) return;
    
    setIsLoading(true);
    const timer = monitoringService.createTimer();
    
    // Simulate async operation with delay
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    const start = currentChunk * chunkSize;
    const end = Math.min(start + chunkSize, data.length);
    const chunk = data.slice(start, end);
    
    setLoadedData(prev => [...prev, ...chunk]);
    onChunkLoad?.(chunk, currentChunk);
    setCurrentChunk(prev => prev + 1);
    setIsLoading(false);
    
    monitoringService.recordCustomMetric(
      'chunk_load_time',
      timer.end(),
      'ms',
      { 
        chunk_index: currentChunk.toString(),
        chunk_size: chunk.length.toString()
      }
    );
  }, [data, chunkSize, currentChunk, totalChunks, isLoading, delay, onChunkLoad]);

  const reset = useCallback(() => {
    setLoadedData([]);
    setCurrentChunk(0);
    setIsLoading(false);
  }, []);

  return {
    loadedData,
    loadNextChunk,
    isLoading,
    hasMore: currentChunk < totalChunks,
    progress: {
      current: currentChunk,
      total: totalChunks,
      percentage: (currentChunk / totalChunks) * 100
    },
    reset
  };
}

/**
 * Component for lazy loading wrapper
 */
export interface LazyLoadWrapperProps {
  children: React.ReactNode;
  placeholder?: React.ReactNode;
  onVisible?: () => void;
  className?: string;
  rootMargin?: string;
  threshold?: number;
}

export function LazyLoadWrapper({
  children,
  placeholder,
  onVisible,
  className,
  rootMargin,
  threshold
}: LazyLoadWrapperProps) {
  const [ref, isVisible] = useLazyLoad<HTMLDivElement>({
    onVisible,
    rootMargin,
    threshold,
    unobserveOnVisible: true
  });

  return React.createElement(
    'div',
    { ref, className },
    isVisible ? children : placeholder
  );
}