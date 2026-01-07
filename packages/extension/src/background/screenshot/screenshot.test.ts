import { describe, it, expect } from 'vitest';
// Import only pure functions that don't have Chrome API dependencies
import { isRestrictedUrl } from './restricted-urls';
import { MAX_IMAGE_DIMENSION } from './constants';
import { calculateChunkCount } from './stitch';

describe('screenshot utilities', () => {
  describe('isRestrictedUrl', () => {
    it('should detect chrome:// URLs as restricted', () => {
      expect(isRestrictedUrl('chrome://extensions')).toBe(true);
      expect(isRestrictedUrl('chrome://settings')).toBe(true);
      expect(isRestrictedUrl('chrome://newtab')).toBe(true);
    });

    it('should detect chrome-extension:// URLs as restricted', () => {
      expect(isRestrictedUrl('chrome-extension://abc123/popup.html')).toBe(true);
    });

    it('should detect edge:// URLs as restricted', () => {
      expect(isRestrictedUrl('edge://extensions')).toBe(true);
    });

    it('should detect about: URLs as restricted', () => {
      expect(isRestrictedUrl('about:blank')).toBe(true);
      expect(isRestrictedUrl('about:srcdoc')).toBe(true);
    });

    it('should detect view-source: URLs as restricted', () => {
      expect(isRestrictedUrl('view-source:https://example.com')).toBe(true);
    });

    it('should detect devtools:// URLs as restricted', () => {
      expect(isRestrictedUrl('devtools://devtools/bundled/inspector.html')).toBe(true);
    });

    it('should allow regular http/https URLs', () => {
      expect(isRestrictedUrl('https://example.com')).toBe(false);
      expect(isRestrictedUrl('http://localhost:3000')).toBe(false);
      expect(isRestrictedUrl('https://docs.astral.sh/uv/')).toBe(false);
    });

    it('should allow file:// URLs', () => {
      expect(isRestrictedUrl('file:///Users/test/index.html')).toBe(false);
    });
  });

  describe('MAX_IMAGE_DIMENSION constant', () => {
    it('should be under Claude API limit of 8000', () => {
      expect(MAX_IMAGE_DIMENSION).toBeLessThan(8000);
    });

    it('should be conservative (7000)', () => {
      expect(MAX_IMAGE_DIMENSION).toBe(7000);
    });
  });

  describe('calculateChunkCount', () => {
    it('should calculate 1 chunk for small pages', () => {
      expect(calculateChunkCount(1000)).toBe(1);
      expect(calculateChunkCount(7000)).toBe(1);
    });

    it('should calculate 2 chunks for medium pages', () => {
      expect(calculateChunkCount(7001)).toBe(2);
      expect(calculateChunkCount(14000)).toBe(2);
    });

    it('should calculate 3 chunks for large pages', () => {
      expect(calculateChunkCount(14001)).toBe(3);
      expect(calculateChunkCount(15381)).toBe(3); // UV docs page
    });

    it('should calculate correctly for very large pages', () => {
      expect(calculateChunkCount(50000)).toBe(8);
    });
  });
});
