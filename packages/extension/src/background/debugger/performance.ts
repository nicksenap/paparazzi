/**
 * Performance metrics and storage access.
 */

import type { PerformanceMetrics, StorageData } from './types';
import { attachedTabs } from './state';
import { attachToTab } from './attach';

/**
 * Get performance metrics for a tab.
 */
export async function getPerformanceMetrics(tabId: number): Promise<PerformanceMetrics> {
  if (!attachedTabs.has(tabId)) {
    await attachToTab(tabId);
  }

  const metrics: PerformanceMetrics = {};

  try {
    // Get CDP metrics
    const result = (await chrome.debugger.sendCommand({ tabId }, 'Performance.getMetrics')) as {
      metrics: Array<{ name: string; value: number }>;
    };

    for (const m of result.metrics) {
      switch (m.name) {
        case 'JSHeapUsedSize':
          metrics.jsHeapSizeUsed = Math.round((m.value / 1024 / 1024) * 100) / 100;
          break;
        case 'JSHeapTotalSize':
          metrics.jsHeapSizeTotal = Math.round((m.value / 1024 / 1024) * 100) / 100;
          break;
        case 'Documents':
          metrics.documents = m.value;
          break;
        case 'Frames':
          metrics.frames = m.value;
          break;
        case 'JSEventListeners':
          metrics.jsEventListeners = m.value;
          break;
        case 'Nodes':
          metrics.nodes = m.value;
          break;
        case 'LayoutCount':
          metrics.layoutCount = m.value;
          break;
        case 'RecalcStyleCount':
          metrics.styleRecalcCount = m.value;
          break;
      }
    }

    // Also get Web Vitals via Runtime.evaluate
    const vitals = (await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
      expression: `
        (function() {
          const entries = performance.getEntriesByType('paint');
          const fcp = entries.find(e => e.name === 'first-contentful-paint');
          const fp = entries.find(e => e.name === 'first-paint');
          const nav = performance.getEntriesByType('navigation')[0];
          return {
            firstPaint: fp ? fp.startTime : null,
            firstContentfulPaint: fcp ? fcp.startTime : null,
            loadTime: nav ? nav.loadEventEnd - nav.startTime : null,
            domContentLoaded: nav ? nav.domContentLoadedEventEnd - nav.startTime : null,
          };
        })()
      `,
      returnByValue: true,
    })) as { result: { value: any } };

    if (vitals.result?.value) {
      const v = vitals.result.value;
      if (v.firstPaint) metrics.firstPaint = Math.round(v.firstPaint);
      if (v.firstContentfulPaint) metrics.firstContentfulPaint = Math.round(v.firstContentfulPaint);
      if (v.loadTime) metrics.loadTime = Math.round(v.loadTime);
      if (v.domContentLoaded) metrics.domContentLoaded = Math.round(v.domContentLoaded);
    }
  } catch (err) {
    console.error('[Paparazzi] Failed to get performance metrics:', err);
  }

  return metrics;
}

/**
 * Get storage data (cookies, localStorage, sessionStorage).
 */
export async function getStorageData(tabId: number): Promise<StorageData> {
  if (!attachedTabs.has(tabId)) {
    await attachToTab(tabId);
  }

  const data: StorageData = {
    cookies: [],
    localStorage: {},
    sessionStorage: {},
  };

  try {
    // Get cookies
    const cookies = (await chrome.debugger.sendCommand({ tabId }, 'Network.getCookies')) as {
      cookies: Array<any>;
    };

    data.cookies = cookies.cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expires,
      httpOnly: c.httpOnly,
      secure: c.secure,
    }));

    // Get localStorage and sessionStorage via evaluation
    const storage = (await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
      expression: `
        (function() {
          const ls = {};
          const ss = {};
          try {
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              ls[key] = localStorage.getItem(key);
            }
          } catch(e) {}
          try {
            for (let i = 0; i < sessionStorage.length; i++) {
              const key = sessionStorage.key(i);
              ss[key] = sessionStorage.getItem(key);
            }
          } catch(e) {}
          return { localStorage: ls, sessionStorage: ss };
        })()
      `,
      returnByValue: true,
    })) as { result: { value: any } };

    if (storage.result?.value) {
      data.localStorage = storage.result.value.localStorage || {};
      data.sessionStorage = storage.result.value.sessionStorage || {};
    }
  } catch (err) {
    console.error('[Paparazzi] Failed to get storage data:', err);
  }

  return data;
}
