/**
 * Type definitions for the debugger module.
 */

export interface NetworkRequest {
  requestId: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  postData?: string;
  timestamp: string;
  type: string;
  status?: number;
  statusText?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  duration?: number;
  error?: string;
}

export interface JSException {
  message: string;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
  stackTrace?: string;
  timestamp: string;
}

export interface PerformanceMetrics {
  domContentLoaded?: number;
  loadTime?: number;
  firstPaint?: number;
  firstContentfulPaint?: number;
  largestContentfulPaint?: number;
  jsHeapSizeUsed?: number;
  jsHeapSizeTotal?: number;
  documents?: number;
  frames?: number;
  jsEventListeners?: number;
  nodes?: number;
  layoutCount?: number;
  styleRecalcCount?: number;
}

export interface StorageData {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires?: number;
    httpOnly: boolean;
    secure: boolean;
  }>;
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
}

export interface EvaluateResult {
  value?: unknown;
  type: string;
  description?: string;
  error?: string;
}
