import type {
  TakeScreenshotParams,
  ScreenshotResult,
  ScreenshotChunk,
  PageMetrics,
  ConsoleLogEntry,
} from '@paparazzi/shared';

// Claude API limit for image dimensions (using 7000 to be conservative)
const MAX_IMAGE_DIMENSION = 7000;
import { attachToTab, isAttached, getConsoleLogs } from './debugger.js';

/**
 * Capture a screenshot of the visible viewport.
 */
export async function captureViewport(
  tabId: number,
  options: { format: 'png' | 'jpeg'; quality?: number }
): Promise<string> {
  const captureOptions: chrome.tabs.CaptureVisibleTabOptions = {
    format: options.format,
    quality: options.format === 'jpeg' ? (options.quality ?? 80) : undefined,
  };

  // captureVisibleTab returns a data URL like "data:image/png;base64,..."
  const dataUrl = await chrome.tabs.captureVisibleTab(undefined, captureOptions);

  // Extract just the base64 part
  const base64Data = dataUrl.split(',')[1];
  return base64Data;
}

/**
 * Get page metrics (dimensions, scroll position) from a tab.
 */
async function getPageMetrics(tabId: number): Promise<PageMetrics> {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      scrollHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      currentScrollY: window.scrollY,
      currentScrollX: window.scrollX,
    }),
  });

  return result as PageMetrics;
}

/**
 * Scroll to a specific Y position and wait for content to settle.
 */
async function scrollTo(tabId: number, y: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (scrollY: number) => {
      // Disable smooth scrolling temporarily for instant scroll
      const html = document.documentElement;
      const originalBehavior = html.style.scrollBehavior;
      html.style.scrollBehavior = 'auto';

      window.scrollTo(0, scrollY);

      // Restore original behavior after a tick
      requestAnimationFrame(() => {
        html.style.scrollBehavior = originalBehavior;
      });
    },
    args: [y],
  });

  // Wait for render and lazy-loaded images
  await new Promise((resolve) => setTimeout(resolve, 300));
}

/**
 * Wait for images in viewport to load.
 */
async function waitForImages(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      return new Promise<void>((resolve) => {
        const images = Array.from(document.querySelectorAll('img'));
        const viewportImages = images.filter((img) => {
          const rect = img.getBoundingClientRect();
          return rect.top < window.innerHeight && rect.bottom > 0;
        });

        const unloaded = viewportImages.filter((img) => !img.complete);

        if (unloaded.length === 0) {
          resolve();
          return;
        }

        let loaded = 0;
        const checkDone = () => {
          loaded++;
          if (loaded >= unloaded.length) resolve();
        };

        unloaded.forEach((img) => {
          if (img.complete) {
            checkDone();
          } else {
            img.addEventListener('load', checkDone, { once: true });
            img.addEventListener('error', checkDone, { once: true });
          }
        });

        // Timeout after 2 seconds
        setTimeout(resolve, 2000);
      });
    },
  });
}

/**
 * Hide fixed/sticky elements during capture to prevent repetition.
 */
async function hideFixedElements(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const elements = document.querySelectorAll('*');
      const fixedElements: HTMLElement[] = [];

      elements.forEach((el) => {
        const style = getComputedStyle(el);
        if (style.position === 'fixed' || style.position === 'sticky') {
          const htmlEl = el as HTMLElement;
          htmlEl.dataset.paparazziDisplay = htmlEl.style.display;
          htmlEl.style.display = 'none';
          fixedElements.push(htmlEl);
        }
      });

      // Store count for restoration
      (window as unknown as { __paparazziFixedCount: number }).__paparazziFixedCount = fixedElements.length;
    },
  });
}

/**
 * Restore fixed/sticky elements after capture.
 */
async function restoreFixedElements(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const elements = document.querySelectorAll('[data-paparazzi-display]');
      elements.forEach((el) => {
        const htmlEl = el as HTMLElement;
        htmlEl.style.display = htmlEl.dataset.paparazziDisplay || '';
        delete htmlEl.dataset.paparazziDisplay;
      });
    },
  });
}

/**
 * Capture a full-page screenshot by scrolling and stitching.
 * Returns chunks if the page exceeds 8000px to stay within Claude API limits.
 * Handles lazy-loaded images and fixed/sticky elements.
 */
export async function captureFullPage(
  tabId: number,
  options: { format: 'png' | 'jpeg'; quality?: number }
): Promise<{ imageData?: string; chunks?: ScreenshotChunk[]; width: number; height: number }> {
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
      if (timeSinceLastCapture < 500) {
        await new Promise((resolve) => setTimeout(resolve, 500 - timeSinceLastCapture));
      }

      const dataUrl = await chrome.tabs.captureVisibleTab(undefined, {
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

  // Check if we need to chunk (page height exceeds 8000px)
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

/**
 * Convert canvas to base64 string.
 */
async function canvasToBase64(canvas: OffscreenCanvas, format: 'png' | 'jpeg'): Promise<string> {
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
 * Stitch screenshots into a single image (for pages under 7000px).
 */
async function stitchToSingleImage(
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
        0, sourceY, viewportWidth, remainingHeight,
        0, y, viewportWidth, remainingHeight
      );
    } else {
      ctx.drawImage(imageBitmap, 0, y);
    }

    imageBitmap.close();
  }

  return canvasToBase64(canvas, format);
}

/**
 * Stitch screenshots into multiple chunks (for pages over 7000px).
 * Each chunk is under MAX_IMAGE_DIMENSION pixels tall.
 */
async function stitchToChunks(
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
        0, sourceY, viewportWidth, remainingHeight,
        0, y, viewportWidth, remainingHeight
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
      0, yOffset, viewportWidth, chunkHeight,  // source
      0, 0, viewportWidth, chunkHeight          // dest
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
 * Main screenshot handler that routes to viewport or full-page capture.
 */
export async function takeScreenshot(
  params: TakeScreenshotParams
): Promise<ScreenshotResult> {
  const mode = params.mode ?? 'viewport';
  const format = params.format ?? 'png';
  const quality = params.quality;
  const includeConsole = params.includeConsole ?? false;

  // Get active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    throw new Error('No active tab found');
  }

  // Check for restricted URLs
  const url = tab.url ?? '';
  if (isRestrictedUrl(url)) {
    throw new Error(
      `Cannot capture screenshots from restricted pages (${url.split(':')[0]}://)`
    );
  }

  let imageData: string | undefined;
  let chunks: ScreenshotChunk[] | undefined;
  let width: number;
  let height: number;

  if (mode === 'fullPage') {
    const result = await captureFullPage(tab.id, { format, quality });
    imageData = result.imageData;
    chunks = result.chunks;
    width = result.width;
    height = result.height;
  } else {
    imageData = await captureViewport(tab.id, { format, quality });

    // Get dimensions for viewport mode
    const metrics = await getPageMetrics(tab.id);
    width = metrics.viewportWidth;
    height = metrics.viewportHeight;
  }

  // Get console logs if requested
  let consoleLogs: ConsoleLogEntry[] | undefined;
  if (includeConsole) {
    try {
      consoleLogs = await getConsoleLogsForTab(tab.id);
    } catch (err) {
      console.warn('[Paparazzi] Failed to get console logs:', err);
    }
  }

  return {
    imageData,
    chunks,
    mimeType: format === 'jpeg' ? 'image/jpeg' : 'image/png',
    width,
    height,
    url: tab.url ?? '',
    title: tab.title ?? '',
    timestamp: new Date().toISOString(),
    consoleLogs,
  };
}

/**
 * Get console logs from a tab using debugger API.
 */
async function getConsoleLogsForTab(tabId: number): Promise<ConsoleLogEntry[]> {
  // Attach debugger if not already attached
  if (!isAttached(tabId)) {
    await attachToTab(tabId);
  }
  return getConsoleLogs(tabId);
}

/**
 * Check if a URL is restricted for screenshot capture.
 */
function isRestrictedUrl(url: string): boolean {
  const restrictedPrefixes = [
    'chrome://',
    'chrome-extension://',
    'edge://',
    'about:',
    'view-source:',
    'devtools://',
  ];

  return restrictedPrefixes.some((prefix) => url.startsWith(prefix));
}
