/**
 * Network request tracking.
 */

import type { Protocol } from 'devtools-protocol';
import type { NetworkRequest } from './types';
import { tabStates, getOrCreateTabState, attachedTabs, MAX_REQUESTS } from './state';

/**
 * Get network requests for a tab.
 */
export function getNetworkRequests(
  tabId: number,
  options?: { clear?: boolean }
): NetworkRequest[] {
  const state = tabStates.get(tabId);
  if (!state) return [];

  const requests = Array.from(state.networkRequests.values());

  if (options?.clear) {
    state.networkRequests.clear();
    state.pendingRequests.clear();
  }

  return requests;
}

/**
 * Get response body for a specific request.
 */
export async function getResponseBody(
  tabId: number,
  requestId: string
): Promise<string | undefined> {
  if (!attachedTabs.has(tabId)) return undefined;

  try {
    const result = (await chrome.debugger.sendCommand(
      { tabId },
      'Network.getResponseBody',
      { requestId }
    )) as { body: string; base64Encoded: boolean };

    return result.base64Encoded ? atob(result.body) : result.body;
  } catch {
    return undefined;
  }
}

/**
 * Handle Network.requestWillBeSent CDP event.
 */
export function handleRequestStarted(tabId: number, params: Protocol.Network.RequestWillBeSentEvent): void {
  const state = getOrCreateTabState(tabId);

  const request: NetworkRequest = {
    requestId: params.requestId,
    url: params.request.url,
    method: params.request.method,
    headers: params.request.headers as Record<string, string>,
    postData: params.request.postData,
    timestamp: new Date(params.timestamp * 1000).toISOString(),
    type: params.type ?? 'Other',
  };

  state.networkRequests.set(params.requestId, request);
  state.pendingRequests.set(params.requestId, { startTime: params.timestamp });

  // Limit stored requests
  if (state.networkRequests.size > MAX_REQUESTS) {
    const oldestKey = state.networkRequests.keys().next().value;
    if (oldestKey) state.networkRequests.delete(oldestKey);
  }
}

/**
 * Handle Network.responseReceived CDP event.
 */
export function handleResponseReceived(tabId: number, params: Protocol.Network.ResponseReceivedEvent): void {
  const state = tabStates.get(tabId);
  if (!state) return;

  const request = state.networkRequests.get(params.requestId);
  if (request) {
    request.status = params.response.status;
    request.statusText = params.response.statusText;
    request.responseHeaders = params.response.headers;
  }
}

/**
 * Handle Network.loadingFinished CDP event.
 */
export function handleLoadingFinished(tabId: number, params: Protocol.Network.LoadingFinishedEvent): void {
  const state = tabStates.get(tabId);
  if (!state) return;

  const request = state.networkRequests.get(params.requestId);
  const pending = state.pendingRequests.get(params.requestId);
  if (request && pending) {
    request.duration = Math.round((params.timestamp - pending.startTime) * 1000);
  }
  state.pendingRequests.delete(params.requestId);
}

/**
 * Handle Network.loadingFailed CDP event.
 */
export function handleLoadingFailed(tabId: number, params: Protocol.Network.LoadingFailedEvent): void {
  const state = tabStates.get(tabId);
  if (!state) return;

  const request = state.networkRequests.get(params.requestId);
  if (request) {
    request.error = params.errorText;
  }
  state.pendingRequests.delete(params.requestId);
}
