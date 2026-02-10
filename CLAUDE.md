# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Paparazzi is a Chrome extension + MCP server that lets Claude see and debug browser tabs in real-time via the Chrome DevTools Protocol. It connects to an existing browser session as a lightweight alternative to Playwright for simple debugging tasks.

## Commands

```bash
# Install & build
pnpm install
pnpm build                  # Build all packages (pnpm -r build)
pnpm build:server            # Build MCP server only
pnpm build:extension         # Build Chrome extension only

# Development (watch mode)
pnpm dev:server
pnpm dev:extension

# Testing
pnpm test                    # Vitest watch mode
pnpm test:run                # Single run (used in CI)
pnpm test:coverage           # Coverage report with v8
pnpm vitest run packages/extension/src/background/debugger/console.test.ts  # Single test file

# Code quality
pnpm lint                    # ESLint with --fix
pnpm typecheck               # tsc -b (project references)
pnpm knip                    # Detect unused exports/dependencies
```

## Architecture

```
Claude (Desktop/Code)
    ↓ MCP Protocol (stdio)
MCP Server (Node.js, packages/mcp-server)
    ↓ WebSocket (port 9222)
Chrome Extension (Service Worker, packages/extension)
    ↓ Chrome DevTools Protocol
Browser Tab
```

**Three packages** in a pnpm monorepo (`packages/*`):

- **`shared`** — TypeScript types for the WebSocket protocol and tool interfaces. Used by both other packages via `workspace:*`.
- **`mcp-server`** — Node.js server that registers 10 MCP tools (screenshot, console, network, exceptions, evaluate JS, DOM snapshot, performance, storage, active tab, refresh). Entry: `src/index.ts` → stdio transport. Tools live in `src/tools/` and all follow the same handler pattern returning `ToolResponse`.
- **`extension`** — Chrome Manifest v3 extension with a service worker. Communicates with the MCP server over WebSocket. Organized into `screenshot/` (viewport/full-page capture with stitching for large pages) and `debugger/` (CDP event routing, per-tab state management).

**Key patterns:**
- WebSocket bridge uses UUID-correlated request/response messages between server and extension
- Tool handlers: `async (bridge, params) → ToolResponse` with try/catch returning `{ content, isError }`
- Tab state tracked via `Map<tabId, TabState>` with cleanup on detach/close
- Full-page screenshots >7000px are split into chunks to respect API limits

## Build System

All packages use **tsup**. The extension bundles all dependencies (`noExternal: [/.*/]`), while the MCP server externalizes node_modules. Shared package generates `.d.ts` files. Build order enforced by TypeScript project references.

## Conventions

- ESM-only (`"type": "module"` everywhere)
- Strict TypeScript, target ES2022
- Files: kebab-case. Types: PascalCase. Functions: camelCase. Constants: UPPER_SNAKE_CASE.
- Feature-based folder organization (screenshot/, debugger/, tools/)
- Zod schemas for all MCP tool input validation
- Tests colocated with source files (`*.test.ts`)
- ESLint 9 flat config with typescript-eslint
