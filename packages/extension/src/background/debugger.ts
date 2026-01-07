/**
 * Chrome Debugger API Module
 *
 * Provides comprehensive debugging capabilities using the Chrome DevTools Protocol (CDP).
 * Features: console logs, network requests, JS exceptions, DOM inspection, performance metrics, storage access.
 */

import type { ConsoleLogEntry, ConsoleLogLevel } from '@paparazzi/shared';

// ============================================================================
// Types
// ============================================================================

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
  // Timing
  domContentLoaded?: number;
  loadTime?: number;
  firstPaint?: number;
  firstContentfulPaint?: number;
  largestContentfulPaint?: number;
  // Memory
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

// ============================================================================
// State
// ============================================================================

const MAX_LOGS = 1000;
const MAX_REQUESTS = 500;
const MAX_EXCEPTIONS = 100;

// Per-tab state
interface TabState {
  consoleLogs: ConsoleLogEntry[];
  networkRequests: Map<string, NetworkRequest>;
  exceptions: JSException[];
  pendingRequests: Map<string, { startTime: number }>;
}

const tabStates = new Map<number, TabState>();
const attachedTabs = new Set<number>();

function getOrCreateTabState(tabId: number): TabState {
  if (!tabStates.has(tabId)) {
    tabStates.set(tabId, {
      consoleLogs: [],
      networkRequests: new Map(),
      exceptions: [],
      pendingRequests: new Map(),
    });
  }
  return tabStates.get(tabId)!;
}

// ============================================================================
// Attach / Detach
// ============================================================================

/**
 * Attach debugger to a tab and enable all CDP domains.
 */
export async function attachToTab(tabId: number): Promise<void> {
  if (attachedTabs.has(tabId)) {
    return;
  }

  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    attachedTabs.add(tabId);
    getOrCreateTabState(tabId);

    // Enable all the CDP domains we need
    await Promise.all([
      chrome.debugger.sendCommand({ tabId }, 'Runtime.enable'),
      chrome.debugger.sendCommand({ tabId }, 'Network.enable'),
      chrome.debugger.sendCommand({ tabId }, 'DOM.enable'),
      chrome.debugger.sendCommand({ tabId }, 'Performance.enable'),
    ]);

    console.log('[Paparazzi] Debugger attached to tab:', tabId);
  } catch (err) {
    console.error('[Paparazzi] Failed to attach debugger:', err);
    throw err;
  }
}

/**
 * Detach debugger from a tab.
 */
export async function detachFromTab(tabId: number): Promise<void> {
  if (!attachedTabs.has(tabId)) {
    return;
  }

  try {
    await chrome.debugger.detach({ tabId });
  } catch {
    // Ignore - tab might be closed
  }

  attachedTabs.delete(tabId);
  tabStates.delete(tabId);
  console.log('[Paparazzi] Debugger detached from tab:', tabId);
}

/**
 * Check if debugger is attached to a tab.
 */
export function isAttached(tabId: number): boolean {
  return attachedTabs.has(tabId);
}

// ============================================================================
// Console Logs
// ============================================================================

function mapLogLevel(type: string): ConsoleLogLevel {
  switch (type) {
    case 'warning':
      return 'warn';
    case 'error':
      return 'error';
    case 'info':
      return 'info';
    case 'debug':
      return 'debug';
    default:
      return 'log';
  }
}

function formatRemoteObject(obj: any): string {
  if (obj.type === 'undefined') return 'undefined';
  if (obj.type === 'string') return obj.value as string;
  if (obj.type === 'number' || obj.type === 'boolean') return String(obj.value);
  if (obj.type === 'object') {
    if (obj.subtype === 'null') return 'null';
    if (obj.subtype === 'error') return obj.description || String(obj.value);
    if (obj.preview) return formatObjectPreview(obj.preview);
    return obj.description || '[object Object]';
  }
  if (obj.type === 'function') return obj.description || '[function]';
  return obj.description || String(obj.value);
}

function formatObjectPreview(preview: any): string {
  if (preview.type === 'object' && preview.subtype === 'array') {
    const items = preview.properties?.map((p: any) => p.value).join(', ') || '';
    return `[${items}${preview.overflow ? ', ...' : ''}]`;
  }
  if (preview.type === 'object') {
    const items = preview.properties?.map((p: any) => `${p.name}: ${p.value}`).join(', ') || '';
    return `{${items}${preview.overflow ? ', ...' : ''}}`;
  }
  return preview.description || '[object]';
}

/**
 * Get console logs for a tab.
 */
export function getConsoleLogs(
  tabId: number,
  options?: { levels?: ConsoleLogLevel[]; clear?: boolean }
): ConsoleLogEntry[] {
  const state = tabStates.get(tabId);
  if (!state) return [];

  let logs = [...state.consoleLogs];

  if (options?.levels && options.levels.length > 0) {
    logs = logs.filter((log) => options.levels!.includes(log.level));
  }

  if (options?.clear) {
    state.consoleLogs = [];
  }

  return logs;
}

// ============================================================================
// Network Requests
// ============================================================================

/**
 * Get network requests for a tab.
 */
export function getNetworkRequests(
  tabId: number,
  options?: { clear?: boolean }
): NetworkRequest[] {
  const state = tabStates.get(tabId);
  if (!state) return [];

  const requests = Array.from(state.networkRequests.values());

  if (options?.clear) {
    state.networkRequests.clear();
    state.pendingRequests.clear();
  }

  return requests;
}

/**
 * Get response body for a specific request.
 */
export async function getResponseBody(
  tabId: number,
  requestId: string
): Promise<string | undefined> {
  if (!attachedTabs.has(tabId)) return undefined;

  try {
    const result = await chrome.debugger.sendCommand(
      { tabId },
      'Network.getResponseBody',
      { requestId }
    ) as { body: string; base64Encoded: boolean };

    return result.base64Encoded ? atob(result.body) : result.body;
  } catch {
    return undefined;
  }
}

// ============================================================================
// JavaScript Exceptions
// ============================================================================

/**
 * Get JavaScript exceptions for a tab.
 */
export function getExceptions(
  tabId: number,
  options?: { clear?: boolean }
): JSException[] {
  const state = tabStates.get(tabId);
  if (!state) return [];

  const exceptions = [...state.exceptions];

  if (options?.clear) {
    state.exceptions = [];
  }

  return exceptions;
}

// ============================================================================
// JavaScript Evaluation
// ============================================================================

/**
 * Evaluate JavaScript in the page context.
 */
export async function evaluateJS(
  tabId: number,
  expression: string
): Promise<EvaluateResult> {
  if (!attachedTabs.has(tabId)) {
    await attachToTab(tabId);
  }

  try {
    const result = await chrome.debugger.sendCommand(
      { tabId },
      'Runtime.evaluate',
      {
        expression,
        returnByValue: true,
        generatePreview: true,
        userGesture: true,
      }
    ) as {
      result: { type: string; value?: any; description?: string };
      exceptionDetails?: { exception: { description: string } };
    };

    if (result.exceptionDetails) {
      return {
        type: 'error',
        error: result.exceptionDetails.exception?.description || 'Unknown error',
      };
    }

    return {
      value: result.result.value,
      type: result.result.type,
      description: result.result.description,
    };
  } catch (err) {
    return {
      type: 'error',
      error: err instanceof Error ? err.message : 'Evaluation failed',
    };
  }
}

// ============================================================================
// DOM Snapshot
// ============================================================================

/**
 * Get the DOM as HTML.
 */
export async function getDOMSnapshot(
  tabId: number,
  selector?: string
): Promise<string> {
  if (!attachedTabs.has(tabId)) {
    await attachToTab(tabId);
  }

  try {
    // Get the document root
    const doc = await chrome.debugger.sendCommand(
      { tabId },
      'DOM.getDocument',
      { depth: -1, pierce: true }
    ) as { root: { nodeId: number } };

    let nodeId = doc.root.nodeId;

    // If a selector is provided, find that element
    if (selector) {
      const queryResult = await chrome.debugger.sendCommand(
        { tabId },
        'DOM.querySelector',
        { nodeId, selector }
      ) as { nodeId: number };

      if (queryResult.nodeId === 0) {
        throw new Error(`Element not found: ${selector}`);
      }
      nodeId = queryResult.nodeId;
    }

    // Get outer HTML
    const html = await chrome.debugger.sendCommand(
      { tabId },
      'DOM.getOuterHTML',
      { nodeId }
    ) as { outerHTML: string };

    return html.outerHTML;
  } catch (err) {
    throw new Error(`Failed to get DOM: ${err instanceof Error ? err.message : err}`);
  }
}

// ============================================================================
// Performance Metrics
// ============================================================================

/**
 * Get performance metrics for a tab.
 */
export async function getPerformanceMetrics(tabId: number): Promise<PerformanceMetrics> {
  if (!attachedTabs.has(tabId)) {
    await attachToTab(tabId);
  }

  const metrics: PerformanceMetrics = {};

  try {
    // Get CDP metrics
    const result = await chrome.debugger.sendCommand(
      { tabId },
      'Performance.getMetrics'
    ) as { metrics: Array<{ name: string; value: number }> };

    for (const m of result.metrics) {
      switch (m.name) {
        case 'DomContentLoaded':
          metrics.domContentLoaded = m.value;
          break;
        case 'NavigationStart':
          // Used to calculate relative timings
          break;
        case 'JSHeapUsedSize':
          metrics.jsHeapSizeUsed = Math.round(m.value / 1024 / 1024 * 100) / 100; // MB
          break;
        case 'JSHeapTotalSize':
          metrics.jsHeapSizeTotal = Math.round(m.value / 1024 / 1024 * 100) / 100; // MB
          break;
        case 'Documents':
          metrics.documents = m.value;
          break;
        case 'Frames':
          metrics.frames = m.value;
          break;
        case 'JSEventListeners':
          metrics.jsEventListeners = m.value;
          break;
        case 'Nodes':
          metrics.nodes = m.value;
          break;
        case 'LayoutCount':
          metrics.layoutCount = m.value;
          break;
        case 'RecalcStyleCount':
          metrics.styleRecalcCount = m.value;
          break;
      }
    }

    // Also get Web Vitals via Runtime.evaluate
    const vitals = await chrome.debugger.sendCommand(
      { tabId },
      'Runtime.evaluate',
      {
        expression: `
          (function() {
            const entries = performance.getEntriesByType('paint');
            const fcp = entries.find(e => e.name === 'first-contentful-paint');
            const fp = entries.find(e => e.name === 'first-paint');
            const nav = performance.getEntriesByType('navigation')[0];
            return {
              firstPaint: fp ? fp.startTime : null,
              firstContentfulPaint: fcp ? fcp.startTime : null,
              loadTime: nav ? nav.loadEventEnd - nav.startTime : null,
              domContentLoaded: nav ? nav.domContentLoadedEventEnd - nav.startTime : null,
            };
          })()
        `,
        returnByValue: true,
      }
    ) as { result: { value: any } };

    if (vitals.result?.value) {
      const v = vitals.result.value;
      if (v.firstPaint) metrics.firstPaint = Math.round(v.firstPaint);
      if (v.firstContentfulPaint) metrics.firstContentfulPaint = Math.round(v.firstContentfulPaint);
      if (v.loadTime) metrics.loadTime = Math.round(v.loadTime);
      if (v.domContentLoaded) metrics.domContentLoaded = Math.round(v.domContentLoaded);
    }
  } catch (err) {
    console.error('[Paparazzi] Failed to get performance metrics:', err);
  }

  return metrics;
}

// ============================================================================
// Storage Access
// ============================================================================

/**
 * Get storage data (cookies, localStorage, sessionStorage).
 */
export async function getStorageData(tabId: number): Promise<StorageData> {
  if (!attachedTabs.has(tabId)) {
    await attachToTab(tabId);
  }

  const data: StorageData = {
    cookies: [],
    localStorage: {},
    sessionStorage: {},
  };

  try {
    // Get cookies
    const cookies = await chrome.debugger.sendCommand(
      { tabId },
      'Network.getCookies'
    ) as { cookies: Array<any> };

    data.cookies = cookies.cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expires,
      httpOnly: c.httpOnly,
      secure: c.secure,
    }));

    // Get localStorage and sessionStorage via evaluation
    const storage = await chrome.debugger.sendCommand(
      { tabId },
      'Runtime.evaluate',
      {
        expression: `
          (function() {
            const ls = {};
            const ss = {};
            try {
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                ls[key] = localStorage.getItem(key);
              }
            } catch(e) {}
            try {
              for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                ss[key] = sessionStorage.getItem(key);
              }
            } catch(e) {}
            return { localStorage: ls, sessionStorage: ss };
          })()
        `,
        returnByValue: true,
      }
    ) as { result: { value: any } };

    if (storage.result?.value) {
      data.localStorage = storage.result.value.localStorage || {};
      data.sessionStorage = storage.result.value.sessionStorage || {};
    }
  } catch (err) {
    console.error('[Paparazzi] Failed to get storage data:', err);
  }

  return data;
}

// ============================================================================
// CDP Event Handlers
// ============================================================================

chrome.debugger.onEvent.addListener((source, method, params: any) => {
  if (!source.tabId || !attachedTabs.has(source.tabId)) return;

  const state = getOrCreateTabState(source.tabId);

  // Console API calls
  if (method === 'Runtime.consoleAPICalled') {
    const entry: ConsoleLogEntry = {
      level: mapLogLevel(params.type),
      message: params.args.map(formatRemoteObject).join(' '),
      timestamp: new Date(params.timestamp).toISOString(),
    };

    if (params.stackTrace?.callFrames?.[0]) {
      const frame = params.stackTrace.callFrames[0];
      const shortUrl = frame.url.split('/').slice(-2).join('/');
      entry.source = `${shortUrl}:${frame.lineNumber + 1}`;
    }

    state.consoleLogs.push(entry);
    while (state.consoleLogs.length > MAX_LOGS) {
      state.consoleLogs.shift();
    }
  }

  // JavaScript exceptions
  if (method === 'Runtime.exceptionThrown') {
    const exc = params.exceptionDetails;
    const exception: JSException = {
      message: exc.exception?.description || exc.text || 'Unknown error',
      url: exc.url,
      lineNumber: exc.lineNumber,
      columnNumber: exc.columnNumber,
      timestamp: new Date(params.timestamp).toISOString(),
    };

    if (exc.stackTrace?.callFrames) {
      exception.stackTrace = exc.stackTrace.callFrames
        .map((f: any) => `  at ${f.functionName || '(anonymous)'} (${f.url}:${f.lineNumber}:${f.columnNumber})`)
        .join('\n');
    }

    state.exceptions.push(exception);
    while (state.exceptions.length > MAX_EXCEPTIONS) {
      state.exceptions.shift();
    }
  }

  // Network request started
  if (method === 'Network.requestWillBeSent') {
    const request: NetworkRequest = {
      requestId: params.requestId,
      url: params.request.url,
      method: params.request.method,
      headers: params.request.headers,
      postData: params.request.postData,
      timestamp: new Date(params.timestamp * 1000).toISOString(),
      type: params.type,
    };

    state.networkRequests.set(params.requestId, request);
    state.pendingRequests.set(params.requestId, { startTime: params.timestamp });

    // Limit stored requests
    if (state.networkRequests.size > MAX_REQUESTS) {
      const oldestKey = state.networkRequests.keys().next().value;
      state.networkRequests.delete(oldestKey);
    }
  }

  // Network response received
  if (method === 'Network.responseReceived') {
    const request = state.networkRequests.get(params.requestId);
    if (request) {
      request.status = params.response.status;
      request.statusText = params.response.statusText;
      request.responseHeaders = params.response.headers;
    }
  }

  // Network loading finished
  if (method === 'Network.loadingFinished') {
    const request = state.networkRequests.get(params.requestId);
    const pending = state.pendingRequests.get(params.requestId);
    if (request && pending) {
      request.duration = Math.round((params.timestamp - pending.startTime) * 1000);
    }
    state.pendingRequests.delete(params.requestId);
  }

  // Network loading failed
  if (method === 'Network.loadingFailed') {
    const request = state.networkRequests.get(params.requestId);
    if (request) {
      request.error = params.errorText;
    }
    state.pendingRequests.delete(params.requestId);
  }
});

// Cleanup on detach
chrome.debugger.onDetach.addListener((source, reason) => {
  if (source.tabId) {
    attachedTabs.delete(source.tabId);
    console.log('[Paparazzi] Debugger detached:', source.tabId, reason);
  }
});

// Cleanup on tab close
chrome.tabs.onRemoved.addListener((tabId) => {
  attachedTabs.delete(tabId);
  tabStates.delete(tabId);
});

// Backwards compatibility exports
export const getLogs = getConsoleLogs;
