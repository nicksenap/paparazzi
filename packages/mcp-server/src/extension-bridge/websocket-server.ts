import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import type {
  RequestMessage,
  ResponseMessage,
  StatusMessage,
  WebSocketMessage,
} from '@paparazzi/shared';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export interface ExtensionBridgeOptions {
  port: number;
  requestTimeout?: number;
}

/**
 * WebSocket bridge for communicating with the Chrome extension.
 *
 * The MCP server uses this to send requests (like "take a screenshot")
 * to the extension and receive responses.
 */
export class ExtensionBridge {
  private wss: WebSocketServer | null = null;
  private connection: WebSocket | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private port: number;
  private requestTimeout: number;

  constructor(options: ExtensionBridgeOptions) {
    this.port = options.port;
    this.requestTimeout = options.requestTimeout ?? 30000;
  }

  /**
   * Start the WebSocket server and begin listening for extension connections.
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({ port: this.port });

      this.wss.on('listening', () => {
        console.error(`[Paparazzi] WebSocket server listening on port ${this.port}`);
        resolve();
      });

      this.wss.on('error', (err) => {
        if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
          console.error(`[Paparazzi] Port ${this.port} is already in use`);
        }
        reject(err);
      });

      this.wss.on('connection', (ws) => {
        console.error('[Paparazzi] Chrome extension connected');
        this.connection = ws;

        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString()) as WebSocketMessage;
            this.handleMessage(message);
          } catch (err) {
            console.error('[Paparazzi] Failed to parse message:', err);
          }
        });

        ws.on('close', () => {
          console.error('[Paparazzi] Chrome extension disconnected');
          this.connection = null;
        });

        ws.on('error', (err) => {
          console.error('[Paparazzi] WebSocket error:', err);
        });
      });
    });
  }

  /**
   * Handle incoming messages from the extension.
   */
  private handleMessage(message: WebSocketMessage): void {
    if (message.type === 'response') {
      const response = message as ResponseMessage;
      const pending = this.pendingRequests.get(response.id);

      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(response.id);

        if (response.success) {
          pending.resolve(response.data);
        } else {
          pending.reject(
            new Error(response.error?.message ?? 'Unknown error from extension')
          );
        }
      }
    } else if (message.type === 'status') {
      const status = message as StatusMessage;
      console.error('[Paparazzi] Extension status:', status);
    }
  }

  /**
   * Send a request to the extension and wait for response.
   */
  async request<T = unknown>(
    action: RequestMessage['action'],
    params?: Record<string, unknown>
  ): Promise<T> {
    if (!this.connection || this.connection.readyState !== WebSocket.OPEN) {
      throw new Error(
        'Chrome extension not connected. Please ensure the Paparazzi extension is installed and enabled, then refresh the page.'
      );
    }

    const id = randomUUID();

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${action}`));
      }, this.requestTimeout);

      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
      });

      const request: RequestMessage = {
        id,
        type: 'request',
        action,
        params,
      };

      this.connection!.send(JSON.stringify(request));
    });
  }

  /**
   * Check if the extension is currently connected.
   */
  isConnected(): boolean {
    return this.connection !== null && this.connection.readyState === WebSocket.OPEN;
  }

  /**
   * Stop the WebSocket server and clean up.
   */
  async stop(): Promise<void> {
    // Reject all pending requests
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Server shutting down'));
    }
    this.pendingRequests.clear();

    // Close connections
    this.connection?.close();

    return new Promise((resolve) => {
      if (this.wss) {
        this.wss.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}
