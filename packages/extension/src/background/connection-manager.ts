import { WebSocketClient, type RequestHandler } from './websocket-client';

export interface ConnectionManagerOptions {
  basePort: number;
  portRangeSize: number;
  onRequest: RequestHandler;
}

/**
 * Manages multiple WebSocket connections — one per port in the range.
 *
 * This allows the extension to communicate with multiple MCP server
 * instances running on different ports simultaneously.
 */
export class ConnectionManager {
  private clients: WebSocketClient[];

  constructor(options: ConnectionManagerOptions) {
    this.clients = Array.from({ length: options.portRangeSize }, (_, i) => {
      const port = options.basePort + i;
      return new WebSocketClient({
        url: `ws://localhost:${port}`,
        onRequest: options.onRequest,
      });
    });
  }

  /**
   * Connect all clients to their respective servers.
   */
  connectAll(): void {
    for (const client of this.clients) {
      client.connect();
    }
  }

  /**
   * Send keepalive pings on all clients.
   */
  pingAll(): void {
    for (const client of this.clients) {
      client.ping();
    }
  }

  /**
   * Check if at least one server is connected.
   */
  isAnyConnected(): boolean {
    return this.clients.some((client) => client.isConnected());
  }
}
