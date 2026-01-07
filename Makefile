.PHONY: install build dev clean test help setup configure

# Default target
help:
	@echo "Paparazzi - Browser Screenshot Tool for Claude"
	@echo ""
	@echo "Usage:"
	@echo "  make install    Install dependencies"
	@echo "  make build      Build all packages"
	@echo "  make dev        Start dev mode (watch)"
	@echo "  make clean      Remove build artifacts"
	@echo "  make server     Run MCP server directly"
	@echo ""
	@echo "Setup:"
	@echo "  make setup      Full setup (install + build + configure)"
	@echo "  make configure  Add to Claude Desktop/Code config (interactive)"
	@echo "  make config     Show config snippet (manual copy)"

# Install dependencies
install:
	pnpm install

# Build all packages
build:
	pnpm build

# Full setup (install + build + configure)
setup: install build configure

# Interactive config wizard
configure:
	@node scripts/setup.js

# Development mode - watch for changes
dev:
	@echo "Starting dev servers..."
	@echo "Extension: pnpm dev:extension"
	@echo "Server:    pnpm dev:server"
	@pnpm dev:extension & pnpm dev:server

# Run MCP server directly (for testing)
server:
	node packages/mcp-server/dist/index.js

# Clean build artifacts
clean:
	rm -rf packages/*/dist
	rm -rf node_modules
	rm -rf packages/*/node_modules

# Show Claude Desktop config
config:
	@echo ""
	@echo "Add this to your Claude Desktop config:"
	@echo "  macOS: ~/Library/Application Support/Claude/claude_desktop_config.json"
	@echo "  Linux: ~/.config/Claude/claude_desktop_config.json"
	@echo ""
	@echo '{'
	@echo '  "mcpServers": {'
	@echo '    "paparazzi": {'
	@echo '      "command": "node",'
	@echo '      "args": ["$(CURDIR)/packages/mcp-server/dist/index.js"]'
	@echo '    }'
	@echo '  }'
	@echo '}'

# Rebuild everything from scratch
rebuild: clean install build
