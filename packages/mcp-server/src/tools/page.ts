/**
 * Page tool handlers (DOM, storage, refresh, active tab).
 */

import type {
  ActiveTabResult,
  PerformanceMetrics,
  StorageData,
  RefreshPageParams,
  RefreshPageResult,
} from '@paparazzi/shared';
import type { ExtensionBridge } from '../extension-bridge/websocket-server';
import type { ToolResponse } from './types';

/**
 * Get active tab handler.
 */
export async function handleGetActiveTab(bridge: ExtensionBridge): Promise<ToolResponse> {
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
      content: [{ type: 'text', text: `Failed to get active tab: ${message}` }],
      isError: true,
    };
  }
}

/**
 * Get DOM snapshot handler.
 */
export async function handleGetDOMSnapshot(
  bridge: ExtensionBridge,
  params: { selector?: string }
): Promise<ToolResponse> {
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

/**
 * Get performance metrics handler.
 */
export async function handleGetPerformanceMetrics(bridge: ExtensionBridge): Promise<ToolResponse> {
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

/**
 * Get storage data handler.
 */
export async function handleGetStorageData(bridge: ExtensionBridge): Promise<ToolResponse> {
  try {
    const data = await bridge.request<StorageData>('getStorageData');

    const lines: string[] = ['Storage Data:', ''];

    // Cookies
    lines.push(`Cookies (${data.cookies.length}):`);
    if (data.cookies.length === 0) {
      lines.push('  (none)');
    } else {
      for (const cookie of data.cookies.slice(0, 20)) {
        const flags = [cookie.httpOnly ? 'HttpOnly' : '', cookie.secure ? 'Secure' : '']
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

/**
 * Refresh page handler.
 */
export async function handleRefreshPage(
  bridge: ExtensionBridge,
  params: { bypassCache?: boolean }
): Promise<ToolResponse> {
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
