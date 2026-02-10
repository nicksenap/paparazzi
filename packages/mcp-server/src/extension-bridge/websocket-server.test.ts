import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExtensionBridge } from './websocket-server';
import WebSocket, { WebSocketServer } from 'ws';

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
      const client = new WebSocket(`ws://localhost:${bridge.getPort()}`);

      await new Promise<void>((resolve) => {
        client.on('open', () => {
          expect(bridge.isConnected()).toBe(true);
          client.close();
          resolve();
        });
      });
    });

    it('should report disconnected after client closes', async () => {
      const client = new WebSocket(`ws://localhost:${bridge.getPort()}`);

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
      const client = new WebSocket(`ws://localhost:${bridge.getPort()}`);

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
      const client = new WebSocket(`ws://localhost:${bridge.getPort()}`);

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
      const client = new WebSocket(`ws://localhost:${bridge.getPort()}`);

      await new Promise<void>((resolve) => {
        client.on('open', resolve);
      });

      // Client doesn't respond
      await expect(bridge.request('getActiveTab')).rejects.toThrow('Request timeout');

      client.close();
    });
  });

  describe('port discovery', () => {
    // These tests manage their own bridge lifecycle
    let extraBridge: ExtensionBridge | null = null;
    const blockers: WebSocketServer[] = [];

    afterEach(async () => {
      await extraBridge?.stop();
      extraBridge = null;
      for (const blocker of blockers) {
        await new Promise<void>((resolve) => blocker.close(() => resolve()));
      }
      blockers.length = 0;
    });

    /** Occupy a port with a raw WebSocketServer */
    function occupyPort(port: number): Promise<WebSocketServer> {
      return new Promise((resolve, reject) => {
        const wss = new WebSocketServer({ port });
        wss.on('listening', () => {
          blockers.push(wss);
          resolve(wss);
        });
        wss.on('error', reject);
      });
    }

    it('should fall back to next port when first is taken', async () => {
      // The main bridge from beforeEach is on TEST_PORT.
      // Create a second bridge on the same base port — it should skip to TEST_PORT+1.
      extraBridge = new ExtensionBridge({
        port: TEST_PORT,
        portRangeSize: 10,
        requestTimeout: 1000,
      });
      await extraBridge.start();

      expect(extraBridge.getPort()).toBe(TEST_PORT + 1);

      // Verify the new bridge actually accepts connections
      const client = new WebSocket(`ws://localhost:${extraBridge.getPort()}`);
      await new Promise<void>((resolve) => {
        client.on('open', () => {
          expect(extraBridge!.isConnected()).toBe(true);
          client.close();
          resolve();
        });
      });
    });

    it('should support multiple bridges on different ports', async () => {
      // Main bridge is on TEST_PORT. Create another one.
      extraBridge = new ExtensionBridge({
        port: TEST_PORT,
        portRangeSize: 10,
        requestTimeout: 1000,
      });
      await extraBridge.start();

      expect(bridge.getPort()).toBe(TEST_PORT);
      expect(extraBridge.getPort()).toBe(TEST_PORT + 1);
      expect(bridge.getPort()).not.toBe(extraBridge.getPort());
    });

    it('should skip port on non-EADDRINUSE errors and continue scanning', async () => {
      // Create a bridge on a fresh port range (not overlapping with TEST_PORT)
      const freshPort = TEST_PORT + 100;
      extraBridge = new ExtensionBridge({
        port: freshPort,
        portRangeSize: 3,
        requestTimeout: 1000,
      });

      // Spy on tryPort: first call rejects with EACCES, rest go through normally
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tryPortSpy = vi.spyOn(extraBridge as any, 'tryPort').mockRejectedValueOnce(
        Object.assign(new Error('listen EACCES'), { code: 'EACCES' })
      );

      await extraBridge.start();

      // First port was skipped due to EACCES, so it should land on freshPort+1
      expect(extraBridge.getPort()).toBe(freshPort + 1);
      // tryPort was called at least twice: once for the failed port, once for the successful one
      expect(tryPortSpy).toHaveBeenCalledTimes(2);

      tryPortSpy.mockRestore();
    });

    it('should throw when all ports in range are exhausted', async () => {
      // Main bridge occupies TEST_PORT. Occupy TEST_PORT+1 and TEST_PORT+2.
      await occupyPort(TEST_PORT + 1);
      await occupyPort(TEST_PORT + 2);

      extraBridge = new ExtensionBridge({
        port: TEST_PORT,
        portRangeSize: 3,
        requestTimeout: 1000,
      });

      await expect(extraBridge.start()).rejects.toThrow('No available port in range');
      extraBridge = null; // nothing to stop
    });
  });
});
