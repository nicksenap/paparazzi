import { ConnectionManager } from './connection-manager';
import { takeScreenshot } from './screenshot/index';
import {
  attachToTab,
  isAttached,
  getConsoleLogs,
  getNetworkRequests,
  getExceptions,
  evaluateJS,
  getDOMSnapshot,
  getPerformanceMetrics,
  getStorageData,
} from './debugger/index';
import {
  DEFAULT_WS_PORT,
  WS_PORT_RANGE_SIZE,
  type RequestMessage,
  type TakeScreenshotParams,
  type GetConsoleLogsParams,
  type ConsoleLogsResult,
  type ActiveTabResult,
  type RefreshPageParams,
  type RefreshPageResult,
} from '@paparazzi/shared';

// Configuration
const KEEPALIVE_ALARM = 'paparazzi-keepalive';
const KEEPALIVE_INTERVAL_MINUTES = 0.5; // 30 seconds

/**
 * Handle incoming requests from the MCP server.
 */
async function handleRequest(request: RequestMessage): Promise<unknown> {
  console.log('[Paparazzi] Handling request:', request.action);

  switch (request.action) {
    case 'takeScreenshot':
      return takeScreenshot(request.params as TakeScreenshotParams);

    case 'getConsoleLogs':
      return handleGetConsoleLogs(request.params as GetConsoleLogsParams);

    case 'getActiveTab':
      return handleGetActiveTab();

    case 'getNetworkRequests':
      return handleGetNetworkRequests(request.params as { clear?: boolean });

    case 'getExceptions':
      return handleGetExceptions(request.params as { clear?: boolean });

    case 'evaluateJS':
      return handleEvaluateJS(request.params as { expression: string });

    case 'getDOMSnapshot':
      return handleGetDOMSnapshot(request.params as { selector?: string });

    case 'getPerformanceMetrics':
      return handleGetPerformanceMetrics();

    case 'getStorageData':
      return handleGetStorageData();

    case 'refreshPage':
      return handleRefreshPage(request.params as RefreshPageParams);

    default:
      throw new Error(`Unknown action: ${request.action}`);
  }
}

/**
 * Get active tab and ensure debugger is attached.
 */
async function getActiveTabWithDebugger(): Promise<chrome.tabs.Tab & { id: number }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    throw new Error('No active tab found');
  }

  if (!isAttached(tab.id)) {
    console.log('[Paparazzi] Attaching debugger to tab:', tab.id);
    await attachToTab(tab.id);
  }

  return tab as chrome.tabs.Tab & { id: number };
}

/**
 * Get console logs from the active tab using debugger API.
 */
async function handleGetConsoleLogs(
  params?: GetConsoleLogsParams
): Promise<ConsoleLogsResult> {
  const tab = await getActiveTabWithDebugger();

  const logs = getConsoleLogs(tab.id, {
    levels: params?.levels,
    clear: params?.clear,
  });

  console.log('[Paparazzi] Returning', logs.length, 'logs');
  return { logs };
}

/**
 * Get network requests from the active tab.
 */
async function handleGetNetworkRequests(params?: { clear?: boolean }) {
  const tab = await getActiveTabWithDebugger();
  const requests = getNetworkRequests(tab.id, { clear: params?.clear });
  console.log('[Paparazzi] Returning', requests.length, 'network requests');
  return { requests };
}

/**
 * Get JavaScript exceptions from the active tab.
 */
async function handleGetExceptions(params?: { clear?: boolean }) {
  const tab = await getActiveTabWithDebugger();
  const exceptions = getExceptions(tab.id, { clear: params?.clear });
  console.log('[Paparazzi] Returning', exceptions.length, 'exceptions');
  return { exceptions };
}

/**
 * Evaluate JavaScript in the active tab.
 */
async function handleEvaluateJS(params: { expression: string }) {
  const tab = await getActiveTabWithDebugger();
  const result = await evaluateJS(tab.id, params.expression);
  console.log('[Paparazzi] Evaluated JS:', result.type);
  return result;
}

/**
 * Get DOM snapshot from the active tab.
 */
async function handleGetDOMSnapshot(params?: { selector?: string }) {
  const tab = await getActiveTabWithDebugger();
  const html = await getDOMSnapshot(tab.id, params?.selector);
  console.log('[Paparazzi] Got DOM snapshot, length:', html.length);
  return { html };
}

/**
 * Get performance metrics from the active tab.
 */
async function handleGetPerformanceMetrics() {
  const tab = await getActiveTabWithDebugger();
  const metrics = await getPerformanceMetrics(tab.id);
  console.log('[Paparazzi] Got performance metrics');
  return metrics;
}

/**
 * Get storage data from the active tab.
 */
async function handleGetStorageData() {
  const tab = await getActiveTabWithDebugger();
  const data = await getStorageData(tab.id);
  console.log('[Paparazzi] Got storage data');
  return data;
}

/**
 * Refresh the active page and wait for it to load.
 */
async function handleRefreshPage(params?: RefreshPageParams): Promise<RefreshPageResult> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    throw new Error('No active tab found');
  }

  // Create a promise that waits for the tab to finish loading
  const waitForLoad = new Promise<void>((resolve) => {
    const listener = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (tabId === tab.id && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });

  // Reload the tab
  await chrome.tabs.reload(tab.id, {
    bypassCache: params?.bypassCache ?? false,
  });

  // Wait for the page to finish loading
  await waitForLoad;

  // Get updated tab info
  const [updatedTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  console.log('[Paparazzi] Page refreshed:', updatedTab?.url);

  return {
    url: updatedTab?.url ?? '',
    title: updatedTab?.title ?? '',
    success: true,
  };
}

/**
 * Get information about the active tab.
 */
async function handleGetActiveTab(): Promise<ActiveTabResult> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    throw new Error('No active tab found');
  }

  return {
    id: tab.id,
    url: tab.url ?? '',
    title: tab.title ?? '',
    windowId: tab.windowId,
  };
}

// Create connection manager for all ports in range
const manager = new ConnectionManager({
  basePort: DEFAULT_WS_PORT,
  portRangeSize: WS_PORT_RANGE_SIZE,
  onRequest: handleRequest,
});

// Connect on startup
console.log('[Paparazzi] Service worker starting...');
manager.connectAll();

// Set up keepalive alarm to prevent service worker from being killed
// and to maintain WebSocket connection
chrome.alarms.create(KEEPALIVE_ALARM, {
  periodInMinutes: KEEPALIVE_INTERVAL_MINUTES,
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE_ALARM) {
    console.log('[Paparazzi] Keepalive ping');
    manager.pingAll();
  }
});

// Handle extension icon click (optional - could show popup in future)
chrome.action.onClicked.addListener(() => {
  const connected = manager.isAnyConnected();
  console.log('[Paparazzi] Extension clicked, connected:', connected);

  // For now, just try to reconnect if not connected
  if (!connected) {
    manager.connectAll();
  }
});

// Reconnect when extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Paparazzi] Extension installed/updated');
  manager.connectAll();
});

// Reconnect when Chrome starts
chrome.runtime.onStartup.addListener(() => {
  console.log('[Paparazzi] Chrome started');
  manager.connectAll();
});

// Log when service worker is about to be suspended
self.addEventListener('beforeunload', () => {
  console.log('[Paparazzi] Service worker suspending...');
});

console.log('[Paparazzi] Service worker initialized');
