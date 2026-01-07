// ============================================
// WebSocket Message Protocol
// ============================================

/** Request from MCP server to extension */
export interface RequestMessage {
  id: string;
  type: 'request';
  action:
    | 'takeScreenshot'
    | 'getConsoleLogs'
    | 'getActiveTab'
    | 'getNetworkRequests'
    | 'getExceptions'
    | 'evaluateJS'
    | 'getDOMSnapshot'
    | 'getPerformanceMetrics'
    | 'getStorageData'
    | 'refreshPage';
  params?: Record<string, unknown>;
}

/** Response from extension to MCP server */
export interface ResponseMessage {
  id: string;
  type: 'response';
  success: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

/** Status update from extension to MCP server */
export interface StatusMessage {
  type: 'status';
  connected: boolean;
  activeTab?: {
    id: number;
    url: string;
    title: string;
  };
}

export type WebSocketMessage = RequestMessage | ResponseMessage | StatusMessage;

// ============================================
// Screenshot Types
// ============================================

export interface TakeScreenshotParams {
  /** Capture mode: viewport (visible area) or fullPage (scroll-stitch) */
  mode?: 'viewport' | 'fullPage';
  /** Image format */
  format?: 'png' | 'jpeg';
  /** JPEG quality (1-100), only used when format is 'jpeg' */
  quality?: number;
  /** Include recent console log entries */
  includeConsole?: boolean;
}

export interface ScreenshotChunk {
  /** Base64 encoded image data (without data:image prefix) */
  imageData: string;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Y offset from top of the full page */
  yOffset: number;
  /** Chunk index (1-based) */
  index: number;
  /** Total number of chunks */
  total: number;
}

export interface ScreenshotResult {
  /** Base64 encoded image data for single image (viewport or small full-page) */
  imageData?: string;
  /** Multiple image chunks for large full-page screenshots */
  chunks?: ScreenshotChunk[];
  /** MIME type of the image(s) */
  mimeType: 'image/png' | 'image/jpeg';
  /** Width in pixels */
  width: number;
  /** Height in pixels (total height for chunked screenshots) */
  height: number;
  /** URL of the captured page */
  url: string;
  /** Title of the captured page */
  title: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Console logs if requested */
  consoleLogs?: ConsoleLogEntry[];
}

// ============================================
// Console Log Types
// ============================================

export type ConsoleLogLevel = 'log' | 'warn' | 'error' | 'info' | 'debug';

export interface ConsoleLogEntry {
  /** Log level */
  level: ConsoleLogLevel;
  /** Log message */
  message: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Source file and line if available */
  source?: string;
}

export interface GetConsoleLogsParams {
  /** Clear logs after retrieval */
  clear?: boolean;
  /** Filter by log levels */
  levels?: ConsoleLogLevel[];
}

export interface ConsoleLogsResult {
  logs: ConsoleLogEntry[];
}

// ============================================
// Active Tab Types
// ============================================

export interface ActiveTabResult {
  id: number;
  url: string;
  title: string;
  windowId: number;
}

// ============================================
// Page Metrics (for full-page capture)
// ============================================

export interface PageMetrics {
  scrollHeight: number;
  scrollWidth: number;
  viewportHeight: number;
  viewportWidth: number;
  currentScrollY: number;
  currentScrollX: number;
}

// ============================================
// Network Request Types
// ============================================

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

export interface GetNetworkRequestsParams {
  /** Clear requests after retrieval */
  clear?: boolean;
}

export interface NetworkRequestsResult {
  requests: NetworkRequest[];
}

// ============================================
// JavaScript Exception Types
// ============================================

export interface JSException {
  message: string;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
  stackTrace?: string;
  timestamp: string;
}

export interface GetExceptionsParams {
  /** Clear exceptions after retrieval */
  clear?: boolean;
}

export interface ExceptionsResult {
  exceptions: JSException[];
}

// ============================================
// JavaScript Evaluation Types
// ============================================

export interface EvaluateJSParams {
  /** JavaScript expression to evaluate */
  expression: string;
}

export interface EvaluateJSResult {
  value?: unknown;
  type: string;
  description?: string;
  error?: string;
}

// ============================================
// DOM Snapshot Types
// ============================================

export interface GetDOMSnapshotParams {
  /** CSS selector to limit the snapshot (default: entire document) */
  selector?: string;
}

export interface DOMSnapshotResult {
  html: string;
}

// ============================================
// Performance Metrics Types
// ============================================

export interface PerformanceMetrics {
  // Timing (in milliseconds)
  domContentLoaded?: number;
  loadTime?: number;
  firstPaint?: number;
  firstContentfulPaint?: number;
  largestContentfulPaint?: number;
  // Memory (in MB)
  jsHeapSizeUsed?: number;
  jsHeapSizeTotal?: number;
  // Counts
  documents?: number;
  frames?: number;
  jsEventListeners?: number;
  nodes?: number;
  layoutCount?: number;
  styleRecalcCount?: number;
}

// ============================================
// Storage Data Types
// ============================================

export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly: boolean;
  secure: boolean;
}

export interface StorageData {
  cookies: Cookie[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
}

// ============================================
// Page Refresh Types
// ============================================

export interface RefreshPageParams {
  /** Bypass cache (hard refresh) */
  bypassCache?: boolean;
}

export interface RefreshPageResult {
  /** URL of the refreshed page */
  url: string;
  /** Title of the refreshed page */
  title: string;
  /** Whether the page was refreshed */
  success: boolean;
}
