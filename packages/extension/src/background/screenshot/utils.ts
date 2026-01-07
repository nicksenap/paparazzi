/**
 * Screenshot utility functions.
 */

import type { ConsoleLogEntry } from '@paparazzi/shared';
import { attachToTab, isAttached, getConsoleLogs } from '../debugger/index';

// Re-export pure functions for convenience
export { isRestrictedUrl, RESTRICTED_PREFIXES } from './restricted-urls';

/**
 * Get console logs from a tab using debugger API.
 */
export async function getConsoleLogsForTab(tabId: number): Promise<ConsoleLogEntry[]> {
  // Attach debugger if not already attached
  if (!isAttached(tabId)) {
    await attachToTab(tabId);
  }
  return getConsoleLogs(tabId);
}
