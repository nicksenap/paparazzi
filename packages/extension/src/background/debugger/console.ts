/**
 * Console log capture and formatting.
 */

import type { ConsoleLogEntry, ConsoleLogLevel } from '@paparazzi/shared';
import { tabStates, getOrCreateTabState, MAX_LOGS } from './state';

/**
 * Map CDP log type to our log level.
 */
export function mapLogLevel(type: string): ConsoleLogLevel {
  switch (type) {
    case 'warning':
      return 'warn';
    case 'error':
      return 'error';
    case 'info':
      return 'info';
    case 'debug':
      return 'debug';
    default:
      return 'log';
  }
}

/**
 * Format a CDP RemoteObject to a string.
 */
export function formatRemoteObject(obj: any): string {
  if (obj.type === 'undefined') return 'undefined';
  if (obj.type === 'string') return obj.value as string;
  if (obj.type === 'number' || obj.type === 'boolean') return String(obj.value);
  if (obj.type === 'object') {
    if (obj.subtype === 'null') return 'null';
    if (obj.subtype === 'error') return obj.description || String(obj.value);
    if (obj.preview) return formatObjectPreview(obj.preview);
    return obj.description || '[object Object]';
  }
  if (obj.type === 'function') return obj.description || '[function]';
  return obj.description || String(obj.value);
}

/**
 * Format a CDP ObjectPreview to a string.
 */
export function formatObjectPreview(preview: any): string {
  if (preview.type === 'object' && preview.subtype === 'array') {
    const items = preview.properties?.map((p: any) => p.value).join(', ') || '';
    return `[${items}${preview.overflow ? ', ...' : ''}]`;
  }
  if (preview.type === 'object') {
    const items = preview.properties?.map((p: any) => `${p.name}: ${p.value}`).join(', ') || '';
    return `{${items}${preview.overflow ? ', ...' : ''}}`;
  }
  return preview.description || '[object]';
}

/**
 * Get console logs for a tab.
 */
export function getConsoleLogs(
  tabId: number,
  options?: { levels?: ConsoleLogLevel[]; clear?: boolean }
): ConsoleLogEntry[] {
  const state = tabStates.get(tabId);
  if (!state) return [];

  let logs = [...state.consoleLogs];

  if (options?.levels && options.levels.length > 0) {
    logs = logs.filter((log) => options.levels!.includes(log.level));
  }

  if (options?.clear) {
    state.consoleLogs = [];
  }

  return logs;
}

/**
 * Handle Runtime.consoleAPICalled CDP event.
 */
export function handleConsoleEvent(tabId: number, params: any): void {
  const state = getOrCreateTabState(tabId);

  const entry: ConsoleLogEntry = {
    level: mapLogLevel(params.type),
    message: params.args.map(formatRemoteObject).join(' '),
    timestamp: new Date(params.timestamp).toISOString(),
  };

  if (params.stackTrace?.callFrames?.[0]) {
    const frame = params.stackTrace.callFrames[0];
    const shortUrl = frame.url.split('/').slice(-2).join('/');
    entry.source = `${shortUrl}:${frame.lineNumber + 1}`;
  }

  state.consoleLogs.push(entry);
  while (state.consoleLogs.length > MAX_LOGS) {
    state.consoleLogs.shift();
  }
}
