/**
 * JavaScript exception handling.
 */

import type { Protocol } from 'devtools-protocol';
import type { JSException } from './types';
import { tabStates, getOrCreateTabState, MAX_EXCEPTIONS } from './state';

/**
 * Get JavaScript exceptions for a tab.
 */
export function getExceptions(
  tabId: number,
  options?: { clear?: boolean }
): JSException[] {
  const state = tabStates.get(tabId);
  if (!state) return [];

  const exceptions = [...state.exceptions];

  if (options?.clear) {
    state.exceptions = [];
  }

  return exceptions;
}

/**
 * Handle Runtime.exceptionThrown CDP event.
 */
export function handleExceptionEvent(tabId: number, params: Protocol.Runtime.ExceptionThrownEvent): void {
  const state = getOrCreateTabState(tabId);

  const exc = params.exceptionDetails;
  const exception: JSException = {
    message: exc.exception?.description || exc.text || 'Unknown error',
    url: exc.url,
    lineNumber: exc.lineNumber,
    columnNumber: exc.columnNumber,
    timestamp: new Date(params.timestamp).toISOString(),
  };

  if (exc.stackTrace?.callFrames) {
    exception.stackTrace = exc.stackTrace.callFrames
      .map(
        (f) =>
          `  at ${f.functionName || '(anonymous)'} (${f.url}:${f.lineNumber}:${f.columnNumber})`
      )
      .join('\n');
  }

  state.exceptions.push(exception);
  while (state.exceptions.length > MAX_EXCEPTIONS) {
    state.exceptions.shift();
  }
}
