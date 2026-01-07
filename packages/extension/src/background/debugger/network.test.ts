import { describe, it, expect, beforeEach } from 'vitest';
import type { Protocol } from 'devtools-protocol';
import { tabStates, getOrCreateTabState } from './state';
import {
  getNetworkRequests,
  handleRequestStarted,
  handleResponseReceived,
  handleLoadingFinished,
  handleLoadingFailed,
} from './network';

describe('network utilities', () => {
  beforeEach(() => {
    // Clear all tab states before each test
    tabStates.clear();
  });

  describe('getNetworkRequests', () => {
    it('should return empty array for unknown tab', () => {
      expect(getNetworkRequests(999)).toEqual([]);
    });

    it('should return requests for existing tab', () => {
      const tabId = 1;
      const state = getOrCreateTabState(tabId);
      state.networkRequests.set('req1', {
        requestId: 'req1',
        url: 'https://example.com',
        method: 'GET',
        headers: {},
        type: 'Document',
        timestamp: '2024-01-01T00:00:00Z',
      });

      const requests = getNetworkRequests(tabId);
      expect(requests).toHaveLength(1);
      expect(requests[0].url).toBe('https://example.com');
    });

    it('should clear requests when clear option is true', () => {
      const tabId = 1;
      const state = getOrCreateTabState(tabId);
      state.networkRequests.set('req1', {
        requestId: 'req1',
        url: 'https://example.com',
        method: 'GET',
        headers: {},
        type: 'Document',
        timestamp: '2024-01-01T00:00:00Z',
      });
      state.pendingRequests.set('req1', { startTime: 1000 });

      const requests = getNetworkRequests(tabId, { clear: true });
      expect(requests).toHaveLength(1);
      expect(state.networkRequests.size).toBe(0);
      expect(state.pendingRequests.size).toBe(0);
    });
  });

  describe('handleRequestStarted', () => {
    it('should create a new network request', () => {
      const tabId = 1;
      // Partial mock - only fields used by handleRequestStarted
      const params = {
        requestId: 'req123',
        loaderId: 'loader1',
        documentURL: 'https://example.com',
        request: {
          url: 'https://api.example.com/data',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          postData: '{"key":"value"}',
        },
        timestamp: 1704067200, // 2024-01-01 00:00:00 UTC
        wallTime: 1704067200,
        initiator: { type: 'script' },
        type: 'XHR',
      } as unknown as Protocol.Network.RequestWillBeSentEvent;

      handleRequestStarted(tabId, params);

      const state = tabStates.get(tabId);
      expect(state).toBeDefined();
      expect(state!.networkRequests.has('req123')).toBe(true);

      const request = state!.networkRequests.get('req123');
      expect(request?.url).toBe('https://api.example.com/data');
      expect(request?.method).toBe('POST');
      expect(request?.postData).toBe('{"key":"value"}');
      expect(request?.type).toBe('XHR');
    });

    it('should default type to "Other" when not provided', () => {
      const tabId = 1;
      const params = {
        requestId: 'req456',
        loaderId: 'loader1',
        documentURL: 'https://example.com',
        request: {
          url: 'https://example.com/resource',
          method: 'GET',
          headers: {},
        },
        timestamp: 1704067200,
        wallTime: 1704067200,
        initiator: { type: 'other' as const },
      };

      handleRequestStarted(tabId, params as Protocol.Network.RequestWillBeSentEvent);

      const state = tabStates.get(tabId);
      const request = state!.networkRequests.get('req456');
      expect(request?.type).toBe('Other');
    });
  });

  describe('handleResponseReceived', () => {
    it('should update request with response data', () => {
      const tabId = 1;
      getOrCreateTabState(tabId).networkRequests.set('req1', {
        requestId: 'req1',
        url: 'https://example.com',
        method: 'GET',
        headers: {},
        type: 'Document',
        timestamp: '2024-01-01T00:00:00Z',
      });

      // Partial mock - only fields used by handleResponseReceived
      const params = {
        requestId: 'req1',
        loaderId: 'loader1',
        timestamp: 1704067201,
        type: 'Document',
        response: {
          url: 'https://example.com',
          status: 200,
          statusText: 'OK',
          headers: { 'Content-Type': 'text/html' },
          mimeType: 'text/html',
          connectionReused: false,
          connectionId: 1,
          encodedDataLength: 1000,
          securityState: 'secure',
        },
      } as unknown as Protocol.Network.ResponseReceivedEvent;

      handleResponseReceived(tabId, params);

      const request = tabStates.get(tabId)!.networkRequests.get('req1');
      expect(request?.status).toBe(200);
      expect(request?.statusText).toBe('OK');
      expect(request?.responseHeaders).toEqual({ 'Content-Type': 'text/html' });
    });

    it('should ignore response for unknown request', () => {
      const tabId = 1;
      getOrCreateTabState(tabId);

      // Partial mock
      const params = {
        requestId: 'unknown',
        loaderId: 'loader1',
        timestamp: 1704067201,
        type: 'Document',
        response: {
          url: 'https://example.com',
          status: 200,
          statusText: 'OK',
          headers: {},
          mimeType: 'text/html',
          connectionReused: false,
          connectionId: 1,
          encodedDataLength: 1000,
          securityState: 'secure',
        },
      } as unknown as Protocol.Network.ResponseReceivedEvent;

      // Should not throw
      handleResponseReceived(tabId, params);
    });
  });

  describe('handleLoadingFinished', () => {
    it('should calculate request duration', () => {
      const tabId = 1;
      const state = getOrCreateTabState(tabId);
      state.networkRequests.set('req1', {
        requestId: 'req1',
        url: 'https://example.com',
        method: 'GET',
        headers: {},
        type: 'Document',
        timestamp: '2024-01-01T00:00:00Z',
      });
      // CDP timestamps are in seconds (monotonic time)
      state.pendingRequests.set('req1', { startTime: 1.0 });

      const params: Protocol.Network.LoadingFinishedEvent = {
        requestId: 'req1',
        timestamp: 1.5, // 1.5 seconds, 500ms after start (1.0 seconds)
        encodedDataLength: 5000,
      };

      handleLoadingFinished(tabId, params);

      const request = state.networkRequests.get('req1');
      expect(request?.duration).toBe(500); // (1.5 - 1.0) * 1000 = 500ms
      expect(state.pendingRequests.has('req1')).toBe(false);
    });
  });

  describe('handleLoadingFailed', () => {
    it('should set error on request', () => {
      const tabId = 1;
      const state = getOrCreateTabState(tabId);
      state.networkRequests.set('req1', {
        requestId: 'req1',
        url: 'https://example.com',
        method: 'GET',
        headers: {},
        type: 'Document',
        timestamp: '2024-01-01T00:00:00Z',
      });
      state.pendingRequests.set('req1', { startTime: 1000 });

      const params: Protocol.Network.LoadingFailedEvent = {
        requestId: 'req1',
        timestamp: 1.5,
        type: 'XHR',
        errorText: 'net::ERR_CONNECTION_REFUSED',
      };

      handleLoadingFailed(tabId, params);

      const request = state.networkRequests.get('req1');
      expect(request?.error).toBe('net::ERR_CONNECTION_REFUSED');
      expect(state.pendingRequests.has('req1')).toBe(false);
    });
  });
});
