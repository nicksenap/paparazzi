/**
 * Screenshot capture functions.
 * Handles viewport and full-page capture coordination.
 */

import type { ScreenshotChunk } from '@paparazzi/shared';
import { MAX_IMAGE_DIMENSION, MIN_CAPTURE_INTERVAL } from './constants';
import {
  getPageMetrics,
  scrollTo,
  waitForImages,
  hideFixedElements,
  restoreFixedElements,
} from './page-manipulation';
import { stitchToSingleImage, stitchToChunks } from './stitch';

export interface CaptureOptions {
  format: 'png' | 'jpeg';
  quality?: number;
}

export interface FullPageCaptureResult {
  imageData?: string;
  chunks?: ScreenshotChunk[];
  width: number;
  height: number;
}

/**
 * Capture a screenshot of the visible viewport.
 */
export async function captureViewport(
  tabId: number,
  options: CaptureOptions
): Promise<string> {
  const captureOptions: chrome.tabs.CaptureVisibleTabOptions = {
    format: options.format,
    quality: options.format === 'jpeg' ? (options.quality ?? 80) : undefined,
  };

  // captureVisibleTab returns a data URL like "data:image/png;base64,..."
  const dataUrl = await chrome.tabs.captureVisibleTab(captureOptions);

  // Extract just the base64 part
  const base64Data = dataUrl.split(',')[1];
  return base64Data;
}

/**
 * Capture a full-page screenshot by scrolling and stitching.
 * Returns chunks if the page exceeds MAX_IMAGE_DIMENSION to stay within Claude API limits.
 * Handles lazy-loaded images and fixed/sticky elements.
 */
export async function captureFullPage(
  tabId: number,
  options: CaptureOptions
): Promise<FullPageCaptureResult> {
  const metrics = await getPageMetrics(tabId);
  const { scrollHeight, viewportHeight, viewportWidth, currentScrollY } = metrics;

  // If page fits in viewport, just capture viewport
  if (scrollHeight <= viewportHeight) {
    const imageData = await captureViewport(tabId, options);
    return {
      imageData,
      width: viewportWidth,
      height: viewportHeight,
    };
  }

  // Hide fixed/sticky elements to prevent them from repeating in every segment
  await hideFixedElements(tabId);

  const screenshots: string[] = [];

  try {
    // Scroll and capture each viewport
    let scrollY = 0;
    let lastCaptureTime = 0;

    while (scrollY < scrollHeight) {
      await scrollTo(tabId, scrollY);

      // Wait for lazy-loaded images in viewport to load
      await waitForImages(tabId);

      // Throttle captures to avoid Chrome's rate limit (MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND)
      const now = Date.now();
      const timeSinceLastCapture = now - lastCaptureTime;
      if (timeSinceLastCapture < MIN_CAPTURE_INTERVAL) {
        await new Promise((resolve) =>
          setTimeout(resolve, MIN_CAPTURE_INTERVAL - timeSinceLastCapture)
        );
      }

      const dataUrl = await chrome.tabs.captureVisibleTab({
        format: options.format,
        quality: options.format === 'jpeg' ? (options.quality ?? 80) : undefined,
      });
      lastCaptureTime = Date.now();

      screenshots.push(dataUrl);
      scrollY += viewportHeight;
    }
  } finally {
    // Always restore fixed elements, even if capture fails
    await restoreFixedElements(tabId);

    // Restore original scroll position
    await scrollTo(tabId, currentScrollY);
  }

  // Check if we need to chunk (page height exceeds MAX_IMAGE_DIMENSION)
  if (scrollHeight <= MAX_IMAGE_DIMENSION) {
    // Single image - stitch everything together
    const imageData = await stitchToSingleImage(screenshots, metrics, options.format);
    return {
      imageData,
      width: viewportWidth,
      height: scrollHeight,
    };
  }

  // Multiple chunks needed - create separate images
  const chunks = await stitchToChunks(screenshots, metrics, options.format);
  return {
    chunks,
    width: viewportWidth,
    height: scrollHeight,
  };
}

// Re-export getPageMetrics for use in the main handler
export { getPageMetrics } from './page-manipulation';
