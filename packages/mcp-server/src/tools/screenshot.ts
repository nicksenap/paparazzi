/**
 * Screenshot tool handler.
 */

import type { TakeScreenshotParams, ScreenshotResult } from '@paparazzi/shared';
import type { ExtensionBridge } from '../extension-bridge/websocket-server';
import type { ToolResponse } from './types';

export async function handleTakeScreenshot(
  bridge: ExtensionBridge,
  params: {
    mode?: 'viewport' | 'fullPage';
    format?: 'png' | 'jpeg';
    quality?: number;
    includeConsole?: boolean;
  }
): Promise<ToolResponse> {
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

    const content: ToolResponse['content'] = [];

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

    return { content, isError: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{ type: 'text', text: `Screenshot failed: ${message}` }],
      isError: true,
    };
  }
}
