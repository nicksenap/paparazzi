# Paparazzi

Chrome extension + MCP server that lets Claude see and debug your browser.

## Why?

Playwright and similar tools are great for browser automation, but they're heavyweight for simple debugging tasks. You end up managing headless browsers, writing selectors, and dealing with async waits — just to let an LLM see what's on screen.

Paparazzi takes a simpler approach: it connects to your existing browser session via the Chrome DevTools Protocol. No extra browser instance, no selectors, no waits.

## Tools

| Tool | Description |
|------|-------------|
| `take_screenshot` | Capture viewport or full page |
| `get_console_logs` | Get console output |
| `get_network_requests` | Inspect XHR/fetch requests |
| `get_exceptions` | Find uncaught JS errors |
| `evaluate_js` | Run JavaScript in page context |
| `get_dom_snapshot` | Get HTML content |
| `get_performance_metrics` | Web Vitals, memory, DOM stats |
| `get_storage_data` | Cookies, localStorage, sessionStorage |
| `get_active_tab` | Current tab URL/title |
| `refresh_page` | Reload (supports hard refresh) |

## Quick Start

```bash
make setup  # Install + build + configure Claude
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

3. Restart Claude Desktop or Claude Code

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
