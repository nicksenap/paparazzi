/**
 * Chrome Debugger API Module
 *
 * Provides comprehensive debugging capabilities using the Chrome DevTools Protocol (CDP).
 * Features: console logs, network requests, JS exceptions, DOM inspection, performance metrics, storage access.
 */

// Re-export types
export type {
  NetworkRequest,
  JSException,
  PerformanceMetrics,
  StorageData,
  EvaluateResult,
} from './types';

// Re-export public API
export { attachToTab, detachFromTab, isAttached } from './attach';
export { getConsoleLogs, handleConsoleEvent } from './console';
export {
  getNetworkRequests,
  getResponseBody,
  handleRequestStarted,
  handleResponseReceived,
  handleLoadingFinished,
  handleLoadingFailed,
} from './network';
export { getExceptions, handleExceptionEvent } from './exceptions';
export { evaluateJS, getDOMSnapshot } from './evaluation';
export { getPerformanceMetrics, getStorageData } from './performance';

// Re-export state for internal use
export { attachedTabs, tabStates, clearTabState } from './state';

// Import handlers for event registration
import { attachedTabs, clearTabState } from './state';
import { handleConsoleEvent } from './console';
import { handleExceptionEvent } from './exceptions';
import {
  handleRequestStarted,
  handleResponseReceived,
  handleLoadingFinished,
  handleLoadingFailed,
} from './network';

// ============================================================================
// CDP Event Handlers
// ============================================================================

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (!source.tabId || !attachedTabs.has(source.tabId)) return;

  const tabId = source.tabId;

  switch (method) {
    case 'Runtime.consoleAPICalled':
      handleConsoleEvent(tabId, params as Parameters<typeof handleConsoleEvent>[1]);
      break;
    case 'Runtime.exceptionThrown':
      handleExceptionEvent(tabId, params as Parameters<typeof handleExceptionEvent>[1]);
      break;
    case 'Network.requestWillBeSent':
      handleRequestStarted(tabId, params as Parameters<typeof handleRequestStarted>[1]);
      break;
    case 'Network.responseReceived':
      handleResponseReceived(tabId, params as Parameters<typeof handleResponseReceived>[1]);
      break;
    case 'Network.loadingFinished':
      handleLoadingFinished(tabId, params as Parameters<typeof handleLoadingFinished>[1]);
      break;
    case 'Network.loadingFailed':
      handleLoadingFailed(tabId, params as Parameters<typeof handleLoadingFailed>[1]);
      break;
  }
});

// Cleanup on detach
chrome.debugger.onDetach.addListener((source, reason) => {
  if (source.tabId) {
    clearTabState(source.tabId);
    console.log('[Paparazzi] Debugger detached:', source.tabId, reason);
  }
});

// Cleanup on tab close
chrome.tabs.onRemoved.addListener((tabId) => {
  clearTabState(tabId);
});

// Backwards compatibility
export { getConsoleLogs as getLogs } from './console';
