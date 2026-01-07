/**
 * Shared state management for the debugger module.
 */

import type { ConsoleLogEntry } from '@paparazzi/shared';
import type { NetworkRequest, JSException } from './types';

// Limits
export const MAX_LOGS = 1000;
export const MAX_REQUESTS = 500;
export const MAX_EXCEPTIONS = 100;

// Per-tab state
export interface TabState {
  consoleLogs: ConsoleLogEntry[];
  networkRequests: Map<string, NetworkRequest>;
  exceptions: JSException[];
  pendingRequests: Map<string, { startTime: number }>;
}

// Global state
export const tabStates = new Map<number, TabState>();
export const attachedTabs = new Set<number>();

/**
 * Get or create state for a tab.
 */
export function getOrCreateTabState(tabId: number): TabState {
  if (!tabStates.has(tabId)) {
    tabStates.set(tabId, {
      consoleLogs: [],
      networkRequests: new Map(),
      exceptions: [],
      pendingRequests: new Map(),
    });
  }
  return tabStates.get(tabId)!;
}

/**
 * Clear state for a tab.
 */
export function clearTabState(tabId: number): void {
  tabStates.delete(tabId);
  attachedTabs.delete(tabId);
}
