#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  const { server, bridge } = await createServer();

  // Set up graceful shutdown
  const shutdown = async () => {
    console.error('[Paparazzi] Shutting down...');
    await bridge.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Connect to stdio transport (how MCP clients communicate with us)
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[Paparazzi] MCP server running on stdio');
  console.error('[Paparazzi] Waiting for Chrome extension connection...');
}

main().catch((error) => {
  console.error('[Paparazzi] Fatal error:', error);
  process.exit(1);
});
