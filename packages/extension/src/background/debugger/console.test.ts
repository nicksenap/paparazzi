import { describe, it, expect } from 'vitest';
import type { Protocol } from 'devtools-protocol';
import { mapLogLevel, formatRemoteObject, formatObjectPreview } from './console';

describe('console utilities', () => {
  describe('mapLogLevel', () => {
    it('should map "warning" to "warn"', () => {
      expect(mapLogLevel('warning')).toBe('warn');
    });

    it('should map "error" to "error"', () => {
      expect(mapLogLevel('error')).toBe('error');
    });

    it('should map "info" to "info"', () => {
      expect(mapLogLevel('info')).toBe('info');
    });

    it('should map "debug" to "debug"', () => {
      expect(mapLogLevel('debug')).toBe('debug');
    });

    it('should map unknown types to "log"', () => {
      expect(mapLogLevel('log')).toBe('log');
      expect(mapLogLevel('trace')).toBe('log');
      expect(mapLogLevel('unknown')).toBe('log');
    });
  });

  describe('formatRemoteObject', () => {
    it('should format undefined type', () => {
      const obj: Protocol.Runtime.RemoteObject = { type: 'undefined' };
      expect(formatRemoteObject(obj)).toBe('undefined');
    });

    it('should format string type', () => {
      const obj: Protocol.Runtime.RemoteObject = { type: 'string', value: 'hello' };
      expect(formatRemoteObject(obj)).toBe('hello');
    });

    it('should format number type', () => {
      const obj: Protocol.Runtime.RemoteObject = { type: 'number', value: 42 };
      expect(formatRemoteObject(obj)).toBe('42');
    });

    it('should format boolean type', () => {
      const obj: Protocol.Runtime.RemoteObject = { type: 'boolean', value: true };
      expect(formatRemoteObject(obj)).toBe('true');
    });

    it('should format null object', () => {
      const obj: Protocol.Runtime.RemoteObject = { type: 'object', subtype: 'null' };
      expect(formatRemoteObject(obj)).toBe('null');
    });

    it('should format error object with description', () => {
      const obj: Protocol.Runtime.RemoteObject = {
        type: 'object',
        subtype: 'error',
        description: 'TypeError: Cannot read property',
      };
      expect(formatRemoteObject(obj)).toBe('TypeError: Cannot read property');
    });

    it('should format function type', () => {
      const obj: Protocol.Runtime.RemoteObject = {
        type: 'function',
        description: 'function myFunc() {}',
      };
      expect(formatRemoteObject(obj)).toBe('function myFunc() {}');
    });

    it('should format function without description', () => {
      const obj: Protocol.Runtime.RemoteObject = { type: 'function' };
      expect(formatRemoteObject(obj)).toBe('[function]');
    });

    it('should format object without preview', () => {
      const obj: Protocol.Runtime.RemoteObject = {
        type: 'object',
        description: 'MyClass',
      };
      expect(formatRemoteObject(obj)).toBe('MyClass');
    });

    it('should fallback to [object Object] for object without description', () => {
      const obj: Protocol.Runtime.RemoteObject = { type: 'object' };
      expect(formatRemoteObject(obj)).toBe('[object Object]');
    });
  });

  describe('formatObjectPreview', () => {
    it('should format array preview', () => {
      const preview: Protocol.Runtime.ObjectPreview = {
        type: 'object',
        subtype: 'array',
        properties: [
          { name: '0', type: 'number', value: '1' },
          { name: '1', type: 'number', value: '2' },
          { name: '2', type: 'number', value: '3' },
        ],
        overflow: false,
      };
      expect(formatObjectPreview(preview)).toBe('[1, 2, 3]');
    });

    it('should format array preview with overflow', () => {
      const preview: Protocol.Runtime.ObjectPreview = {
        type: 'object',
        subtype: 'array',
        properties: [
          { name: '0', type: 'string', value: 'a' },
          { name: '1', type: 'string', value: 'b' },
        ],
        overflow: true,
      };
      expect(formatObjectPreview(preview)).toBe('[a, b, ...]');
    });

    it('should format object preview', () => {
      const preview: Protocol.Runtime.ObjectPreview = {
        type: 'object',
        properties: [
          { name: 'foo', type: 'string', value: 'bar' },
          { name: 'count', type: 'number', value: '42' },
        ],
        overflow: false,
      };
      expect(formatObjectPreview(preview)).toBe('{foo: bar, count: 42}');
    });

    it('should format object preview with overflow', () => {
      const preview: Protocol.Runtime.ObjectPreview = {
        type: 'object',
        properties: [{ name: 'key', type: 'string', value: 'value' }],
        overflow: true,
      };
      expect(formatObjectPreview(preview)).toBe('{key: value, ...}');
    });

    it('should handle empty properties', () => {
      const preview: Protocol.Runtime.ObjectPreview = {
        type: 'object',
        properties: [],
        overflow: false,
      };
      expect(formatObjectPreview(preview)).toBe('{}');
    });

    it('should fallback for non-object types with description', () => {
      const preview = {
        type: 'function',
        description: 'function() {}',
        overflow: false,
      } as Protocol.Runtime.ObjectPreview;
      expect(formatObjectPreview(preview)).toBe('function() {}');
    });
  });
});
