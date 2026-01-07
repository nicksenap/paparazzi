import { describe, it, expect, beforeEach } from 'vitest';
import {
  tabStates,
  attachedTabs,
  getOrCreateTabState,
  clearTabState,
  MAX_LOGS,
  MAX_REQUESTS,
  MAX_EXCEPTIONS,
} from './state';

describe('state management', () => {
  beforeEach(() => {
    // Clear all state before each test
    tabStates.clear();
    attachedTabs.clear();
  });

  describe('constants', () => {
    it('should have reasonable limits', () => {
      expect(MAX_LOGS).toBe(1000);
      expect(MAX_REQUESTS).toBe(500);
      expect(MAX_EXCEPTIONS).toBe(100);
    });
  });

  describe('getOrCreateTabState', () => {
    it('should create new state for unknown tab', () => {
      const tabId = 123;
      expect(tabStates.has(tabId)).toBe(false);

      const state = getOrCreateTabState(tabId);

      expect(tabStates.has(tabId)).toBe(true);
      expect(state.consoleLogs).toEqual([]);
      expect(state.networkRequests).toBeInstanceOf(Map);
      expect(state.networkRequests.size).toBe(0);
      expect(state.exceptions).toEqual([]);
      expect(state.pendingRequests).toBeInstanceOf(Map);
      expect(state.pendingRequests.size).toBe(0);
    });

    it('should return existing state for known tab', () => {
      const tabId = 456;
      const state1 = getOrCreateTabState(tabId);
      state1.consoleLogs.push({
        level: 'log',
        message: 'test',
        timestamp: '2024-01-01T00:00:00Z',
      });

      const state2 = getOrCreateTabState(tabId);

      expect(state2).toBe(state1);
      expect(state2.consoleLogs).toHaveLength(1);
    });
  });

  describe('clearTabState', () => {
    it('should remove tab state', () => {
      const tabId = 789;
      getOrCreateTabState(tabId);
      attachedTabs.add(tabId);

      expect(tabStates.has(tabId)).toBe(true);
      expect(attachedTabs.has(tabId)).toBe(true);

      clearTabState(tabId);

      expect(tabStates.has(tabId)).toBe(false);
      expect(attachedTabs.has(tabId)).toBe(false);
    });

    it('should handle clearing non-existent tab gracefully', () => {
      // Should not throw
      clearTabState(999);
    });
  });
});
