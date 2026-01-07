/**
 * Console Interceptor Content Script
 *
 * This script runs in the context of web pages and intercepts console.* calls
 * to capture logs for debugging purposes.
 *
 * It overrides the native console methods while still calling the originals,
 * so normal console output continues to work.
 */

import type { ConsoleLogEntry, ConsoleLogLevel } from '@paparazzi/shared';

// Store intercepted logs
const consoleLogs: ConsoleLogEntry[] = [];
const MAX_LOGS = 1000;

// Store original console methods
const originalConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  info: console.info.bind(console),
  debug: console.debug.bind(console),
};

/**
 * Format a value for logging (handle objects, errors, etc.)
 */
function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';

  if (value instanceof Error) {
    return `${value.name}: ${value.message}${value.stack ? '\n' + value.stack : ''}`;
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

/**
 * Get source location from stack trace (if available)
 */
function getSourceLocation(): string | undefined {
  try {
    const stack = new Error().stack;
    if (!stack) return undefined;

    // Parse stack to find the caller (skip our interceptor frames)
    const lines = stack.split('\n');
    // Find the first line that's not from our interceptor
    for (let i = 3; i < lines.length; i++) {
      const line = lines[i];
      if (line && !line.includes('console-interceptor')) {
        // Extract file:line:col from the stack frame
        const match = line.match(/(?:at\s+)?(?:.*?\s+\()?(.+?):(\d+):(\d+)\)?$/);
        if (match) {
          const [, file, line] = match;
          // Trim long file paths
          const shortFile = file.split('/').slice(-2).join('/');
          return `${shortFile}:${line}`;
        }
      }
    }
  } catch {
    // Ignore errors in source location extraction
  }
  return undefined;
}

/**
 * Intercept a console method and capture its output.
 */
function interceptConsoleMethod(level: ConsoleLogLevel): void {
  const original = originalConsole[level];

  console[level] = (...args: unknown[]) => {
    // Capture the log entry
    const entry: ConsoleLogEntry = {
      level,
      message: args.map(formatValue).join(' '),
      timestamp: new Date().toISOString(),
      source: getSourceLocation(),
    };

    consoleLogs.push(entry);

    // Trim if too many logs
    while (consoleLogs.length > MAX_LOGS) {
      consoleLogs.shift();
    }

    // Call original console method
    original(...args);
  };
}

// Intercept all console methods
const levels: ConsoleLogLevel[] = ['log', 'warn', 'error', 'info', 'debug'];
levels.forEach(interceptConsoleMethod);

/**
 * Handle messages from the service worker.
 */
chrome.runtime.onMessage.addListener(
  (
    message: { action: string; clear?: boolean; levels?: ConsoleLogLevel[] },
    _sender,
    sendResponse
  ) => {
    if (message.action === 'getConsoleLogs') {
      let logs = [...consoleLogs];

      // Filter by levels if specified
      if (message.levels && message.levels.length > 0) {
        logs = logs.filter((log) => message.levels!.includes(log.level));
      }

      sendResponse({ logs });

      // Clear logs if requested
      if (message.clear) {
        consoleLogs.length = 0;
      }
    }

    // Return true to indicate we'll send a response asynchronously
    // (even though we send it synchronously, this prevents "port closed" errors)
    return true;
  }
);

// Log that the interceptor is active (visible in DevTools console)
originalConsole.log('[Paparazzi] Console interceptor active');

// Test: log something to verify interception works
setTimeout(() => {
  originalConsole.log('[Paparazzi] Captured logs count:', consoleLogs.length);
}, 3000);
