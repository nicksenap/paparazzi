import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ExtensionBridge } from './websocket-server';
import WebSocket from 'ws';

describe('ExtensionBridge', () => {
  let bridge: ExtensionBridge;
  const TEST_PORT = 19222; // Use non-standard port for tests

  beforeEach(async () => {
    bridge = new ExtensionBridge({ port: TEST_PORT, requestTimeout: 1000 });
    await bridge.start();
  });

  afterEach(async () => {
    await bridge.stop();
  });

  describe('connection', () => {
    it('should report not connected when no client', () => {
      expect(bridge.isConnected()).toBe(false);
    });

    it('should accept WebSocket connections', async () => {
      const client = new WebSocket(`ws://localhost:${TEST_PORT}`);

      await new Promise<void>((resolve) => {
        client.on('open', () => {
          expect(bridge.isConnected()).toBe(true);
          client.close();
          resolve();
        });
      });
    });

    it('should report disconnected after client closes', async () => {
      const client = new WebSocket(`ws://localhost:${TEST_PORT}`);

      await new Promise<void>((resolve) => {
        client.on('open', () => {
          client.close();
        });
        client.on('close', () => {
          // Give bridge time to process close
          setTimeout(() => {
            expect(bridge.isConnected()).toBe(false);
            resolve();
          }, 50);
        });
      });
    });
  });

  describe('request', () => {
    it('should throw when no connection', async () => {
      await expect(bridge.request('getActiveTab')).rejects.toThrow(
        'Chrome extension not connected'
      );
    });

    it('should send request and receive response', async () => {
      const client = new WebSocket(`ws://localhost:${TEST_PORT}`);

      await new Promise<void>((resolve) => {
        client.on('open', resolve);
      });

      // Mock client that echoes back response
      client.on('message', (data) => {
        const request = JSON.parse(data.toString());
        client.send(
          JSON.stringify({
            id: request.id,
            type: 'response',
            success: true,
            data: { url: 'https://example.com', title: 'Test' },
          })
        );
      });

      const result = await bridge.request<{ url: string; title: string }>('getActiveTab');
      expect(result.url).toBe('https://example.com');
      expect(result.title).toBe('Test');

      client.close();
    });

    it('should reject on error response', async () => {
      const client = new WebSocket(`ws://localhost:${TEST_PORT}`);

      await new Promise<void>((resolve) => {
        client.on('open', resolve);
      });

      client.on('message', (data) => {
        const request = JSON.parse(data.toString());
        client.send(
          JSON.stringify({
            id: request.id,
            type: 'response',
            success: false,
            error: { code: 'TEST_ERROR', message: 'Something went wrong' },
          })
        );
      });

      await expect(bridge.request('getActiveTab')).rejects.toThrow('Something went wrong');

      client.close();
    });

    it('should timeout on no response', async () => {
      const client = new WebSocket(`ws://localhost:${TEST_PORT}`);

      await new Promise<void>((resolve) => {
        client.on('open', resolve);
      });

      // Client doesn't respond
      await expect(bridge.request('getActiveTab')).rejects.toThrow('Request timeout');

      client.close();
    });
  });
});
