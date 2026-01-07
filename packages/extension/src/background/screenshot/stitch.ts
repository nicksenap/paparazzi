/**
 * Image stitching functions for full-page screenshots.
 * Handles canvas operations and chunking for large pages.
 */

import type { PageMetrics, ScreenshotChunk } from '@paparazzi/shared';
import { MAX_IMAGE_DIMENSION } from './constants';

/**
 * Convert canvas to base64 string.
 */
export async function canvasToBase64(
  canvas: OffscreenCanvas,
  format: 'png' | 'jpeg'
): Promise<string> {
  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const blob = await canvas.convertToBlob({ type: mimeType });
  const arrayBuffer = await blob.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  let binary = '';
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
}

/**
 * Stitch screenshots into a single image (for pages under MAX_IMAGE_DIMENSION).
 */
export async function stitchToSingleImage(
  screenshots: string[],
  metrics: PageMetrics,
  format: 'png' | 'jpeg'
): Promise<string> {
  const { viewportWidth, viewportHeight, scrollHeight } = metrics;

  const canvas = new OffscreenCanvas(viewportWidth, scrollHeight);
  const ctx = canvas.getContext('2d')!;

  for (let i = 0; i < screenshots.length; i++) {
    const dataUrl = screenshots[i];
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const imageBitmap = await createImageBitmap(blob);

    const y = i * viewportHeight;
    const remainingHeight = scrollHeight - y;

    if (i === screenshots.length - 1 && remainingHeight < viewportHeight) {
      // Last segment: only draw the visible portion
      const sourceY = viewportHeight - remainingHeight;
      ctx.drawImage(
        imageBitmap,
        0,
        sourceY,
        viewportWidth,
        remainingHeight,
        0,
        y,
        viewportWidth,
        remainingHeight
      );
    } else {
      ctx.drawImage(imageBitmap, 0, y);
    }

    imageBitmap.close();
  }

  return canvasToBase64(canvas, format);
}

/**
 * Stitch screenshots into multiple chunks (for pages over MAX_IMAGE_DIMENSION).
 * Each chunk is under MAX_IMAGE_DIMENSION pixels tall.
 */
export async function stitchToChunks(
  screenshots: string[],
  metrics: PageMetrics,
  format: 'png' | 'jpeg'
): Promise<ScreenshotChunk[]> {
  const { viewportWidth, viewportHeight, scrollHeight } = metrics;

  // First, create the full stitched image in memory
  const fullCanvas = new OffscreenCanvas(viewportWidth, scrollHeight);
  const fullCtx = fullCanvas.getContext('2d')!;

  for (let i = 0; i < screenshots.length; i++) {
    const dataUrl = screenshots[i];
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const imageBitmap = await createImageBitmap(blob);

    const y = i * viewportHeight;
    const remainingHeight = scrollHeight - y;

    if (i === screenshots.length - 1 && remainingHeight < viewportHeight) {
      const sourceY = viewportHeight - remainingHeight;
      fullCtx.drawImage(
        imageBitmap,
        0,
        sourceY,
        viewportWidth,
        remainingHeight,
        0,
        y,
        viewportWidth,
        remainingHeight
      );
    } else {
      fullCtx.drawImage(imageBitmap, 0, y);
    }

    imageBitmap.close();
  }

  // Now split into chunks
  const chunks: ScreenshotChunk[] = [];
  const numChunks = Math.ceil(scrollHeight / MAX_IMAGE_DIMENSION);

  for (let i = 0; i < numChunks; i++) {
    const yOffset = i * MAX_IMAGE_DIMENSION;
    const chunkHeight = Math.min(MAX_IMAGE_DIMENSION, scrollHeight - yOffset);

    const chunkCanvas = new OffscreenCanvas(viewportWidth, chunkHeight);
    const chunkCtx = chunkCanvas.getContext('2d')!;

    // Draw portion of the full image onto this chunk
    chunkCtx.drawImage(
      fullCanvas,
      0,
      yOffset,
      viewportWidth,
      chunkHeight, // source
      0,
      0,
      viewportWidth,
      chunkHeight // dest
    );

    const imageData = await canvasToBase64(chunkCanvas, format);

    chunks.push({
      imageData,
      width: viewportWidth,
      height: chunkHeight,
      yOffset,
      index: i + 1,
      total: numChunks,
    });
  }

  return chunks;
}

/**
 * Calculate the number of chunks needed for a given height.
 */
export function calculateChunkCount(height: number): number {
  return Math.ceil(height / MAX_IMAGE_DIMENSION);
}
