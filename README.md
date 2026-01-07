# Paparazzi

Chrome extension + MCP server that lets Claude see and debug your browser.

```
Claude ←─MCP─→ Server ←─WebSocket─→ Chrome Extension
              (9222)
```

## Setup

```bash
pnpm install && pnpm build
```

1. Load extension: `chrome://extensions/` → Developer mode → Load unpacked → select `packages/extension`
2. Add to Claude config:

```json
{
  "mcpServers": {
    "paparazzi": {
      "command": "node",
      "args": ["/path/to/paparazzi/packages/mcp-server/dist/index.js"]
    }
  }
}
```

3. Restart Claude

## Tools

| Tool | Description |
|------|-------------|
| `take_screenshot` | Capture viewport or full page (auto-chunks pages >7000px) |
| `get_console_logs` | Get console.log/warn/error entries |
| `get_network_requests` | Get XHR/fetch requests with timing |
| `get_exceptions` | Get uncaught JS errors |
| `evaluate_js` | Run JavaScript in page context |
| `get_dom_snapshot` | Get HTML content |
| `get_performance_metrics` | Get Web Vitals, memory, DOM stats |
| `get_storage_data` | Get cookies, localStorage, sessionStorage |
| `get_active_tab` | Get current tab URL/title |
| `refresh_page` | Reload the page (supports hard refresh) |

## Development

```bash
pnpm dev:extension  # Watch extension
pnpm dev:server     # Watch MCP server
```

## Troubleshooting

- **Extension not connected**: Click extension icon to reconnect
- **Restricted pages**: Can't capture `chrome://`, `about:`, extension pages
- **Port conflict**: Set `PAPARAZZI_PORT` env var, update extension to match

## License

MIT
