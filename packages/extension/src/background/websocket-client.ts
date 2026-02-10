import type {
  RequestMessage,
  ResponseMessage,
  StatusMessage,
  WebSocketMessage,
} from '@paparazzi/shared';

export type RequestHandler = (
  request: RequestMessage
) => Promise<unknown>;

export interface WebSocketClientOptions {
  url: string;
  reconnectInterval?: number;
  onRequest: RequestHandler;
}

/**
 * WebSocket client for connecting to the MCP server.
 *
 * Handles automatic reconnection and request/response correlation.
 */
export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private logPrefix: string;
  private reconnectInterval: number;
  private onRequest: RequestHandler;
  private reconnectTimeout: number | null = null;
  private isIntentionallyClosed = false;

  constructor(options: WebSocketClientOptions) {
    this.url = options.url;
    // Extract port from URL for log messages (e.g. "[Paparazzi:9222]")
    const port = new URL(options.url).port;
    this.logPrefix = `[Paparazzi:${port}]`;
    this.reconnectInterval = options.reconnectInterval ?? 3000;
    this.onRequest = options.onRequest;
  }

  /**
   * Connect to the WebSocket server.
   */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.isIntentionallyClosed = false;

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log(`${this.logPrefix} Connected to MCP server`);
        this.sendStatus();
      };

      this.ws.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data as string) as WebSocketMessage;
          await this.handleMessage(message);
        } catch (err) {
          console.error(`${this.logPrefix} Failed to handle message:`, err);
        }
      };

      this.ws.onclose = () => {
        console.log(`${this.logPrefix} Disconnected from MCP server`);
        this.ws = null;
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error(`${this.logPrefix} WebSocket error:`, error);
      };
    } catch (err) {
      console.error(`${this.logPrefix} Failed to connect:`, err);
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from the WebSocket server.
   */
  disconnect(): void {
    this.isIntentionallyClosed = true;
    if (this.reconnectTimeout !== null) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  /**
   * Check if connected to the server.
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Send a keepalive ping to prevent connection from going stale.
   */
  ping(): void {
    if (this.isConnected()) {
      this.sendStatus();
    } else {
      this.connect();
    }
  }

  /**
   * Schedule a reconnection attempt.
   */
  private scheduleReconnect(): void {
    if (this.isIntentionallyClosed) {
      return;
    }

    if (this.reconnectTimeout !== null) {
      return;
    }

    console.log(`${this.logPrefix} Reconnecting in ${this.reconnectInterval}ms...`);
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, this.reconnectInterval) as unknown as number;
  }

  /**
   * Handle incoming messages from the server.
   */
  private async handleMessage(message: WebSocketMessage): Promise<void> {
    if (message.type === 'request') {
      const request = message as RequestMessage;
      console.log(`${this.logPrefix} Received request:`, request.action);

      try {
        const data = await this.onRequest(request);
        this.sendResponse(request.id, true, data);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error(`${this.logPrefix} Request failed:`, errorMessage);
        this.sendResponse(request.id, false, undefined, {
          code: 'REQUEST_FAILED',
          message: errorMessage,
        });
      }
    }
  }

  /**
   * Send a response back to the server.
   */
  private sendResponse(
    id: string,
    success: boolean,
    data?: unknown,
    error?: { code: string; message: string }
  ): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error(`${this.logPrefix} Cannot send response: not connected`);
      return;
    }

    const response: ResponseMessage = {
      id,
      type: 'response',
      success,
      data,
      error,
    };

    this.ws.send(JSON.stringify(response));
  }

  /**
   * Send current status to the server.
   */
  private async sendStatus(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      const status: StatusMessage = {
        type: 'status',
        connected: true,
        activeTab: tab
          ? {
              id: tab.id!,
              url: tab.url ?? '',
              title: tab.title ?? '',
            }
          : undefined,
      };

      this.ws.send(JSON.stringify(status));
    } catch (err) {
      console.error(`${this.logPrefix} Failed to send status:`, err);
    }
  }
}
