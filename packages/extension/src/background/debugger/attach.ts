/**
 * Debugger attachment management.
 */

import { attachedTabs, getOrCreateTabState, clearTabState } from './state';

/**
 * Attach debugger to a tab and enable all CDP domains.
 */
export async function attachToTab(tabId: number): Promise<void> {
  if (attachedTabs.has(tabId)) {
    return;
  }

  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    attachedTabs.add(tabId);
    getOrCreateTabState(tabId);

    // Enable all the CDP domains we need
    await Promise.all([
      chrome.debugger.sendCommand({ tabId }, 'Runtime.enable'),
      chrome.debugger.sendCommand({ tabId }, 'Network.enable'),
      chrome.debugger.sendCommand({ tabId }, 'DOM.enable'),
      chrome.debugger.sendCommand({ tabId }, 'Performance.enable'),
    ]);

    console.log('[Paparazzi] Debugger attached to tab:', tabId);
  } catch (err) {
    console.error('[Paparazzi] Failed to attach debugger:', err);
    throw err;
  }
}

/**
 * Detach debugger from a tab.
 */
export async function detachFromTab(tabId: number): Promise<void> {
  if (!attachedTabs.has(tabId)) {
    return;
  }

  try {
    await chrome.debugger.detach({ tabId });
  } catch {
    // Ignore - tab might be closed
  }

  clearTabState(tabId);
  console.log('[Paparazzi] Debugger detached from tab:', tabId);
}

/**
 * Check if debugger is attached to a tab.
 */
export function isAttached(tabId: number): boolean {
  return attachedTabs.has(tabId);
}
