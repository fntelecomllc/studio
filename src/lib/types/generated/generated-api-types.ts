/**
 * Auto-generated API Types from Go Backend
 * Generated: 2025-06-20T15:12:12.829Z
 * Source: Go Backend API Contracts
 * 
 * DO NOT EDIT MANUALLY - This file is auto-generated
 */

import { SafeBigInt, UUID, ISODateString } from '../branded';
import * as Models from './generated-models';

// ============================================
// GENERAL API TYPES
// ============================================

// Common API types

export interface APIError {
  error: string;
  message: string;
  statusCode: number;
  details?: Record<string, unknown>;
  requestId?: string;
  timestamp: ISODateString;
}

export interface PaginationRequest {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginationResponse<T> {
  data: T[];
  total: SafeBigInt;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}
