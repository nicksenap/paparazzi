/**
 * Debugger tool handlers (console, network, exceptions, evaluate).
 */

import type {
  GetConsoleLogsParams,
  ConsoleLogsResult,
  NetworkRequest,
  JSException,
} from '@paparazzi/shared';
import type { ExtensionBridge } from '../extension-bridge/websocket-server';
import type { ToolResponse } from './types';

/**
 * Get console logs handler.
 */
export async function handleGetConsoleLogs(
  bridge: ExtensionBridge,
  params: { clear?: boolean; levels?: ('log' | 'warn' | 'error' | 'info' | 'debug')[] }
): Promise<ToolResponse> {
  try {
    const consoleParams: GetConsoleLogsParams = {
      clear: params.clear,
      levels: params.levels,
    };

    const result = await bridge.request<ConsoleLogsResult>(
      'getConsoleLogs',
      consoleParams as Record<string, unknown>
    );

    if (result.logs.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'No console logs captured. Make sure you have navigated to a page and generated some console output.',
          },
        ],
        isError: false,
      };
    }

    const logsText = result.logs
      .map((log) => {
        const prefix = `[${log.level.toUpperCase().padEnd(5)}]`;
        const source = log.source ? ` (${log.source})` : '';
        return `${prefix} ${log.timestamp}${source}: ${log.message}`;
      })
      .join('\n');

    return {
      content: [
        { type: 'text', text: `Console Logs (${result.logs.length} entries):\n\n${logsText}` },
      ],
      isError: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{ type: 'text', text: `Failed to get console logs: ${message}` }],
      isError: true,
    };
  }
}

/**
 * Get network requests handler.
 */
export async function handleGetNetworkRequests(
  bridge: ExtensionBridge,
  params: { clear?: boolean }
): Promise<ToolResponse> {
  try {
    const result = await bridge.request<{ requests: NetworkRequest[] }>('getNetworkRequests', {
      clear: params.clear,
    });

    if (result.requests.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'No network requests captured. Make sure the debugger is attached and some network activity has occurred.',
          },
        ],
        isError: false,
      };
    }

    const requestsText = result.requests
      .map((req) => {
        const status = req.status ? `${req.status} ${req.statusText || ''}` : 'pending';
        const duration = req.duration ? `${req.duration}ms` : '-';
        const error = req.error ? ` [ERROR: ${req.error}]` : '';
        return `${req.method} ${req.url}\n    Status: ${status} | Duration: ${duration} | Type: ${req.type}${error}`;
      })
      .join('\n\n');

    return {
      content: [
        { type: 'text', text: `Network Requests (${result.requests.length} captured):\n\n${requestsText}` },
      ],
      isError: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{ type: 'text', text: `Failed to get network requests: ${message}` }],
      isError: true,
    };
  }
}

/**
 * Get exceptions handler.
 */
export async function handleGetExceptions(
  bridge: ExtensionBridge,
  params: { clear?: boolean }
): Promise<ToolResponse> {
  try {
    const result = await bridge.request<{ exceptions: JSException[] }>('getExceptions', {
      clear: params.clear,
    });

    if (result.exceptions.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'No JavaScript exceptions captured. The page may be running without errors.',
          },
        ],
        isError: false,
      };
    }

    const exceptionsText = result.exceptions
      .map((exc) => {
        const location = exc.url
          ? `\n    Location: ${exc.url}:${exc.lineNumber}:${exc.columnNumber}`
          : '';
        const stack = exc.stackTrace ? `\n    Stack:\n${exc.stackTrace}` : '';
        return `[${exc.timestamp}] ${exc.message}${location}${stack}`;
      })
      .join('\n\n');

    return {
      content: [
        {
          type: 'text',
          text: `JavaScript Exceptions (${result.exceptions.length} captured):\n\n${exceptionsText}`,
        },
      ],
      isError: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{ type: 'text', text: `Failed to get exceptions: ${message}` }],
      isError: true,
    };
  }
}

/**
 * Evaluate JS handler.
 */
export async function handleEvaluateJS(
  bridge: ExtensionBridge,
  params: { expression: string }
): Promise<ToolResponse> {
  try {
    const result = await bridge.request<{
      value?: unknown;
      type: string;
      description?: string;
      error?: string;
    }>('evaluateJS', { expression: params.expression });

    if (result.error) {
      return {
        content: [{ type: 'text', text: `Evaluation error: ${result.error}` }],
        isError: true,
      };
    }

    const valueStr =
      result.value !== undefined
        ? typeof result.value === 'object'
          ? JSON.stringify(result.value, null, 2)
          : String(result.value)
        : result.description || 'undefined';

    return {
      content: [{ type: 'text', text: `Result (${result.type}):\n${valueStr}` }],
      isError: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{ type: 'text', text: `Failed to evaluate JS: ${message}` }],
      isError: true,
    };
  }
}
