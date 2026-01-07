/**
 * Page manipulation functions for screenshot capture.
 * Handles scrolling, fixed elements, and image loading.
 */

import type { PageMetrics } from '@paparazzi/shared';
import { SCROLL_SETTLE_DELAY, IMAGE_LOAD_TIMEOUT } from './constants';

/**
 * Get page metrics (dimensions, scroll position) from a tab.
 */
export async function getPageMetrics(tabId: number): Promise<PageMetrics> {
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
export async function scrollTo(tabId: number, y: number): Promise<void> {
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
  await new Promise((resolve) => setTimeout(resolve, SCROLL_SETTLE_DELAY));
}

/**
 * Wait for images in viewport to load.
 */
export async function waitForImages(tabId: number): Promise<void> {
  const timeout = IMAGE_LOAD_TIMEOUT;

  await chrome.scripting.executeScript({
    target: { tabId },
    func: (timeoutMs: number) => {
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

        // Timeout fallback
        setTimeout(resolve, timeoutMs);
      });
    },
    args: [timeout],
  });
}

/**
 * Hide fixed/sticky elements during capture to prevent repetition.
 */
export async function hideFixedElements(tabId: number): Promise<void> {
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
      (window as unknown as { __paparazziFixedCount: number }).__paparazziFixedCount =
        fixedElements.length;
    },
  });
}

/**
 * Restore fixed/sticky elements after capture.
 */
export async function restoreFixedElements(tabId: number): Promise<void> {
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
