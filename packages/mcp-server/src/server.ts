import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ExtensionBridge } from './extension-bridge/websocket-server.js';
import type {
  TakeScreenshotParams,
  ScreenshotResult,
  GetConsoleLogsParams,
  ConsoleLogsResult,
  ActiveTabResult,
  NetworkRequest,
  JSException,
  PerformanceMetrics,
  StorageData,
  RefreshPageParams,
  RefreshPageResult,
} from '@paparazzi/shared';

const DEFAULT_PORT = 9222;

export interface ServerOptions {
  port?: number;
}

/**
 * Create and configure the MCP server with screenshot tools.
 */
export async function createServer(options: ServerOptions = {}): Promise<{
  server: McpServer;
  bridge: ExtensionBridge;
}> {
  // Use || instead of ?? because Number(undefined) returns NaN, which isn't nullish
  const port = options.port || Number(process.env.PAPARAZZI_PORT) || DEFAULT_PORT;

  const server = new McpServer(
    {
      name: 'paparazzi',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Initialize WebSocket bridge to extension
  const bridge = new ExtensionBridge({ port });
  await bridge.start();

  // ==========================================
  // Tool: take_screenshot
  // ==========================================
  server.tool(
    'take_screenshot',
    'Captures a screenshot of the active browser tab. Use this to see what the user is looking at, debug UI issues, or verify visual changes. Requires the Paparazzi Chrome extension to be installed.',
    {
      mode: z
        .enum(['viewport', 'fullPage'])
        .default('viewport')
        .describe(
          "Capture mode: 'viewport' for visible area only (fast), 'fullPage' for entire scrollable page (slower, stitches multiple screenshots)"
        ),
      format: z
        .enum(['png', 'jpeg'])
        .default('png')
        .describe("Image format: 'png' for lossless quality, 'jpeg' for smaller file size"),
      quality: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe('JPEG quality (1-100). Only used when format is jpeg. Default: 80'),
      includeConsole: z
        .boolean()
        .default(false)
        .describe('Include recent console log entries in the response'),
    },
    async (params) => {
      try {
        const screenshotParams: TakeScreenshotParams = {
          mode: params.mode,
          format: params.format,
          quality: params.quality,
          includeConsole: params.includeConsole,
        };

        const result = await bridge.request<ScreenshotResult>(
          'takeScreenshot',
          screenshotParams as Record<string, unknown>
        );

        // Build response content
        const content: Array<
          { type: 'image'; data: string; mimeType: string } | { type: 'text'; text: string }
        > = [];

        // Handle chunked images (for pages > 7000px)
        if (result.chunks && result.chunks.length > 0) {
          content.push({
            type: 'text',
            text: `Full page screenshot captured from: ${result.url}\nTitle: ${result.title}\nTotal dimensions: ${result.width}x${result.height}\nSplit into ${result.chunks.length} images:\nCaptured at: ${result.timestamp}`,
          });

          for (const chunk of result.chunks) {
            content.push({
              type: 'text',
              text: `\n--- Image ${chunk.index}/${chunk.total} (y: ${chunk.yOffset}px, height: ${chunk.height}px) ---`,
            });
            content.push({
              type: 'image',
              data: chunk.imageData,
              mimeType: result.mimeType,
            });
          }
        } else if (result.imageData) {
          // Single image
          content.push({
            type: 'image',
            data: result.imageData,
            mimeType: result.mimeType,
          });
          content.push({
            type: 'text',
            text: `Screenshot captured from: ${result.url}\nTitle: ${result.title}\nDimensions: ${result.width}x${result.height}\nCaptured at: ${result.timestamp}`,
          });
        }

        // Add console logs if requested and present
        if (result.consoleLogs && result.consoleLogs.length > 0) {
          const logsText = result.consoleLogs
            .map((log) => `[${log.level.toUpperCase()}] ${log.timestamp}: ${log.message}`)
            .join('\n');
          content.push({
            type: 'text',
            text: `\n--- Console Logs (${result.consoleLogs.length} entries) ---\n${logsText}`,
          });
        }

        return {
          content,
          isError: false,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text',
              text: `Screenshot failed: ${message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ==========================================
  // Tool: get_console_logs
  // ==========================================
  server.tool(
    'get_console_logs',
    'Retrieves recent console log entries from the active browser tab. Useful for debugging JavaScript errors, warnings, and application logs without needing to open DevTools.',
    {
      clear: z
        .boolean()
        .default(false)
        .describe('Clear the log buffer after retrieval'),
      levels: z
        .array(z.enum(['log', 'warn', 'error', 'info', 'debug']))
        .optional()
        .describe('Filter by specific log levels. If not specified, returns all levels.'),
    },
    async (params) => {
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
            {
              type: 'text',
              text: `Console Logs (${result.logs.length} entries):\n\n${logsText}`,
            },
          ],
          isError: false,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get console logs: ${message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ==========================================
  // Tool: get_active_tab
  // ==========================================
  server.tool(
    'get_active_tab',
    'Gets information about the currently active browser tab, including URL and title. Useful to verify which page is being viewed before taking a screenshot.',
    {},
    async () => {
      try {
        const result = await bridge.request<ActiveTabResult>('getActiveTab');

        return {
          content: [
            {
              type: 'text',
              text: `Active Tab:\n  URL: ${result.url}\n  Title: ${result.title}\n  Tab ID: ${result.id}\n  Window ID: ${result.windowId}`,
            },
          ],
          isError: false,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get active tab: ${message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ==========================================
  // Tool: get_network_requests
  // ==========================================
  server.tool(
    'get_network_requests',
    'Retrieves network requests (XHR, fetch, etc.) from the active browser tab. Useful for debugging API calls, seeing failed requests, and understanding network traffic.',
    {
      clear: z
        .boolean()
        .default(false)
        .describe('Clear the request buffer after retrieval'),
    },
    async (params) => {
      try {
        const result = await bridge.request<{ requests: NetworkRequest[] }>(
          'getNetworkRequests',
          { clear: params.clear }
        );

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
            {
              type: 'text',
              text: `Network Requests (${result.requests.length} captured):\n\n${requestsText}`,
            },
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
  );

  // ==========================================
  // Tool: get_exceptions
  // ==========================================
  server.tool(
    'get_exceptions',
    'Retrieves JavaScript exceptions/errors from the active browser tab. Catches uncaught errors even if they are not logged to the console.',
    {
      clear: z
        .boolean()
        .default(false)
        .describe('Clear the exceptions buffer after retrieval'),
    },
    async (params) => {
      try {
        const result = await bridge.request<{ exceptions: JSException[] }>(
          'getExceptions',
          { clear: params.clear }
        );

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
            const location = exc.url ? `\n    Location: ${exc.url}:${exc.lineNumber}:${exc.columnNumber}` : '';
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
  );

  // ==========================================
  // Tool: evaluate_js
  // ==========================================
  server.tool(
    'evaluate_js',
    'Evaluates JavaScript code in the context of the active browser tab. Useful for inspecting page state, testing code snippets, or modifying the page.',
    {
      expression: z.string().describe('JavaScript expression to evaluate in the page context'),
    },
    async (params) => {
      try {
        const result = await bridge.request<{
          value?: unknown;
          type: string;
          description?: string;
          error?: string;
        }>('evaluateJS', { expression: params.expression });

        if (result.error) {
          return {
            content: [
              {
                type: 'text',
                text: `Evaluation error: ${result.error}`,
              },
            ],
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
          content: [
            {
              type: 'text',
              text: `Result (${result.type}):\n${valueStr}`,
            },
          ],
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
  );

  // ==========================================
  // Tool: get_dom_snapshot
  // ==========================================
  server.tool(
    'get_dom_snapshot',
    'Gets the HTML content of the active browser tab. Useful for inspecting page structure, debugging layout issues, or understanding the DOM.',
    {
      selector: z
        .string()
        .optional()
        .describe('CSS selector to limit the snapshot to a specific element (default: entire document)'),
    },
    async (params) => {
      try {
        const result = await bridge.request<{ html: string }>('getDOMSnapshot', {
          selector: params.selector,
        });

        // Truncate very long HTML
        const maxLength = 50000;
        let html = result.html;
        let truncated = false;
        if (html.length > maxLength) {
          html = html.slice(0, maxLength);
          truncated = true;
        }

        return {
          content: [
            {
              type: 'text',
              text: truncated
                ? `DOM Snapshot (truncated to ${maxLength} chars):\n\n${html}\n\n... [truncated]`
                : `DOM Snapshot:\n\n${html}`,
            },
          ],
          isError: false,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text', text: `Failed to get DOM snapshot: ${message}` }],
          isError: true,
        };
      }
    }
  );

  // ==========================================
  // Tool: get_performance_metrics
  // ==========================================
  server.tool(
    'get_performance_metrics',
    'Gets performance metrics from the active browser tab including Web Vitals, memory usage, and DOM statistics. Useful for debugging performance issues.',
    {},
    async () => {
      try {
        const metrics = await bridge.request<PerformanceMetrics>('getPerformanceMetrics');

        const lines: string[] = ['Performance Metrics:', ''];

        // Timing
        lines.push('Timing:');
        if (metrics.domContentLoaded !== undefined)
          lines.push(`  DOM Content Loaded: ${metrics.domContentLoaded}ms`);
        if (metrics.loadTime !== undefined) lines.push(`  Page Load Time: ${metrics.loadTime}ms`);
        if (metrics.firstPaint !== undefined) lines.push(`  First Paint: ${metrics.firstPaint}ms`);
        if (metrics.firstContentfulPaint !== undefined)
          lines.push(`  First Contentful Paint: ${metrics.firstContentfulPaint}ms`);

        // Memory
        lines.push('');
        lines.push('Memory:');
        if (metrics.jsHeapSizeUsed !== undefined)
          lines.push(`  JS Heap Used: ${metrics.jsHeapSizeUsed} MB`);
        if (metrics.jsHeapSizeTotal !== undefined)
          lines.push(`  JS Heap Total: ${metrics.jsHeapSizeTotal} MB`);

        // DOM Stats
        lines.push('');
        lines.push('DOM Statistics:');
        if (metrics.nodes !== undefined) lines.push(`  DOM Nodes: ${metrics.nodes}`);
        if (metrics.documents !== undefined) lines.push(`  Documents: ${metrics.documents}`);
        if (metrics.frames !== undefined) lines.push(`  Frames: ${metrics.frames}`);
        if (metrics.jsEventListeners !== undefined)
          lines.push(`  Event Listeners: ${metrics.jsEventListeners}`);
        if (metrics.layoutCount !== undefined) lines.push(`  Layout Count: ${metrics.layoutCount}`);
        if (metrics.styleRecalcCount !== undefined)
          lines.push(`  Style Recalc Count: ${metrics.styleRecalcCount}`);

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
          isError: false,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text', text: `Failed to get performance metrics: ${message}` }],
          isError: true,
        };
      }
    }
  );

  // ==========================================
  // Tool: get_storage_data
  // ==========================================
  server.tool(
    'get_storage_data',
    'Gets storage data from the active browser tab including cookies, localStorage, and sessionStorage. Useful for debugging authentication, user preferences, and cached data.',
    {},
    async () => {
      try {
        const data = await bridge.request<StorageData>('getStorageData');

        const lines: string[] = ['Storage Data:', ''];

        // Cookies
        lines.push(`Cookies (${data.cookies.length}):`);
        if (data.cookies.length === 0) {
          lines.push('  (none)');
        } else {
          for (const cookie of data.cookies.slice(0, 20)) {
            // Limit to 20 cookies
            const flags = [
              cookie.httpOnly ? 'HttpOnly' : '',
              cookie.secure ? 'Secure' : '',
            ]
              .filter(Boolean)
              .join(', ');
            const value = cookie.value.length > 50 ? cookie.value.slice(0, 50) + '...' : cookie.value;
            lines.push(`  ${cookie.name}: ${value} ${flags ? `[${flags}]` : ''}`);
          }
          if (data.cookies.length > 20) {
            lines.push(`  ... and ${data.cookies.length - 20} more`);
          }
        }

        // localStorage
        const lsKeys = Object.keys(data.localStorage);
        lines.push('');
        lines.push(`localStorage (${lsKeys.length} items):`);
        if (lsKeys.length === 0) {
          lines.push('  (empty)');
        } else {
          for (const key of lsKeys.slice(0, 15)) {
            const value = data.localStorage[key];
            const truncated = value.length > 100 ? value.slice(0, 100) + '...' : value;
            lines.push(`  ${key}: ${truncated}`);
          }
          if (lsKeys.length > 15) {
            lines.push(`  ... and ${lsKeys.length - 15} more`);
          }
        }

        // sessionStorage
        const ssKeys = Object.keys(data.sessionStorage);
        lines.push('');
        lines.push(`sessionStorage (${ssKeys.length} items):`);
        if (ssKeys.length === 0) {
          lines.push('  (empty)');
        } else {
          for (const key of ssKeys.slice(0, 15)) {
            const value = data.sessionStorage[key];
            const truncated = value.length > 100 ? value.slice(0, 100) + '...' : value;
            lines.push(`  ${key}: ${truncated}`);
          }
          if (ssKeys.length > 15) {
            lines.push(`  ... and ${ssKeys.length - 15} more`);
          }
        }

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
          isError: false,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text', text: `Failed to get storage data: ${message}` }],
          isError: true,
        };
      }
    }
  );

  // ==========================================
  // Tool: refresh_page
  // ==========================================
  server.tool(
    'refresh_page',
    'Refreshes the active browser tab and waits for the page to fully load. Useful for capturing fresh network requests, console logs, and page state after a reload. Supports hard refresh (bypass cache) option.',
    {
      bypassCache: z
        .boolean()
        .default(false)
        .describe(
          'Bypass browser cache (hard refresh). When true, forces the browser to re-download all resources.'
        ),
    },
    async (params) => {
      try {
        const refreshParams: RefreshPageParams = {
          bypassCache: params.bypassCache,
        };

        const result = await bridge.request<RefreshPageResult>(
          'refreshPage',
          refreshParams as Record<string, unknown>
        );

        return {
          content: [
            {
              type: 'text',
              text: `Page refreshed successfully!\n  URL: ${result.url}\n  Title: ${result.title}\n  Cache bypassed: ${params.bypassCache}`,
            },
          ],
          isError: false,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text', text: `Failed to refresh page: ${message}` }],
          isError: true,
        };
      }
    }
  );

  return { server, bridge };
}
