# Paparazzi

Chrome extension + MCP server that lets Claude see and debug your browser.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Claude                                      │
│                         (Desktop / Code)                                 │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   │ MCP Protocol (stdio)
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           MCP Server                                     │
│  ┌───────────────────┐  ┌─────────────────┐  ┌───────────────────────┐  │
│  │    MCP Tools      │  │ Extension Bridge│  │   @modelcontextprotocol│  │
│  │ take_screenshot   │  │ WebSocket :9222 │  │   /sdk (stdio)        │  │
│  │ get_console_logs  │  │                 │  │                       │  │
│  │ get_network_reqs  │  │                 │  │                       │  │
│  │ evaluate_js       │  │                 │  │                       │  │
│  │ get_dom_snapshot  │  │                 │  │                       │  │
│  └───────────────────┘  └─────────────────┘  └───────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   │ WebSocket (port 9222)
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Chrome Extension                                  │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                 Background Service Worker                       │    │
│  │  ┌─────────────────────────┐  ┌───────────────────────────┐     │    │
│  │  │    chrome.debugger      │  │ chrome.tabs.captureVisible│     │    │
│  │  │  (CDP v1.3)             │  │ Tab()                     │     │    │
│  │  │  • Runtime.consoleAPI   │  └───────────────────────────┘     │    │
│  │  │  • Network.*            │                                    │    │
│  │  │  • DOM.getOuterHTML     │                                    │    │
│  │  │  • Performance.metrics  │                                    │    │
│  │  └─────────────────────────┘                                    │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   │ Chrome DevTools Protocol
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Browser Tab                                    │
│                    (the page being debugged)                             │
└─────────────────────────────────────────────────────────────────────────┘
```

### Package Structure

```
packages/
├── mcp-server/     # Node.js MCP server
│   └── src/
│       ├── server.ts           # MCP protocol handler
│       ├── tools/              # Tool implementations
│       └── extension-bridge/   # WebSocket client
├── extension/      # Chrome extension
│   └── src/
│       └── background/         # Service worker + CDP debugger
└── shared/         # Shared TypeScript types
```

## Quick Start

```bash
# Full setup (install + build + configure Claude)
make setup
```

Or step by step:

```bash
pnpm install && pnpm build
make configure  # Interactive setup wizard
```

### Manual Setup

1. Load extension: `chrome://extensions/` → Developer mode → Load unpacked → select `packages/extension`
2. Add to Claude config (or use `make configure`):

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

### CI Checks

```bash
pnpm lint           # ESLint
pnpm typecheck      # TypeScript
pnpm knip           # Unused code detection
pnpm test:run       # Vitest
```

### Make Targets

| Target | Description |
|--------|-------------|
| `make setup` | Full setup: install + build + configure |
| `make configure` | Interactive wizard to add to Claude config |
| `make install` | Install dependencies |
| `make build` | Build all packages |
| `make dev` | Start dev mode (watch) |
| `make server` | Run MCP server directly |
| `make config` | Show config snippet for manual copy |
| `make clean` | Remove build artifacts |
| `make rebuild` | Clean + install + build |

## Troubleshooting

- **Extension not connected**: Click extension icon to reconnect
- **Restricted pages**: Can't capture `chrome://`, `about:`, extension pages
- **Port conflict**: Set `PAPARAZZI_PORT` env var, update extension to match

## License

MIT
