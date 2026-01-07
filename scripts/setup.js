#!/usr/bin/env node

/**
 * Paparazzi Setup Wizard
 *
 * Automatically configures the MCP server for Claude Desktop and/or Claude Code.
 * Handles existing configs gracefully (no duplicates).
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';

const HOME = os.homedir();
const PAPARAZZI_ROOT = path.resolve(import.meta.dirname, '..');
const SERVER_PATH = path.join(PAPARAZZI_ROOT, 'packages/mcp-server/dist/index.js');

// Config file locations
const CONFIG_PATHS = {
  'Claude Desktop': {
    darwin: path.join(HOME, 'Library/Application Support/Claude/claude_desktop_config.json'),
    linux: path.join(HOME, '.config/Claude/claude_desktop_config.json'),
    win32: path.join(HOME, 'AppData/Roaming/Claude/claude_desktop_config.json'),
  },
  'Claude Code': {
    // Claude Code uses ~/.claude.json for MCP servers (NOT ~/.claude/settings.json)
    darwin: path.join(HOME, '.claude.json'),
    linux: path.join(HOME, '.claude.json'),
    win32: path.join(HOME, '.claude.json'),
  },
};

// The MCP server config we want to add
const PAPARAZZI_CONFIG = {
  type: 'stdio',
  command: 'node',
  args: [SERVER_PATH],
  env: {},
};

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function log(msg, color = '') {
  console.log(`${color}${msg}${colors.reset}`);
}

function getConfigPath(appName) {
  const platform = process.platform;
  const paths = CONFIG_PATHS[appName];
  return paths?.[platform] || paths?.linux;
}

function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function writeJsonFile(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function checkExistingConfig(config) {
  if (!config?.mcpServers?.paparazzi) {
    return { exists: false };
  }

  const existing = config.mcpServers.paparazzi;
  const isSame = existing.args?.[0] === SERVER_PATH;

  return { exists: true, isSame, existing };
}

async function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function configureApp(appName) {
  const configPath = getConfigPath(appName);

  if (!configPath) {
    log(`  ⚠ ${appName}: Platform not supported`, colors.yellow);
    return false;
  }

  log(`\n${colors.cyan}${appName}${colors.reset}`);
  log(`  Config: ${colors.dim}${configPath}${colors.reset}`);

  // Read existing config
  let config = readJsonFile(configPath);
  const configExists = config !== null;

  if (!configExists) {
    config = {};
    log(`  Status: No config file found, will create new one`);
  }

  // Check if paparazzi is already configured
  const { exists, isSame, existing } = checkExistingConfig(config);

  if (exists && isSame) {
    log(`  ${colors.green}✓ Already configured correctly${colors.reset}`);
    return true;
  }

  if (exists && !isSame) {
    log(`  ⚠ Existing paparazzi config found with different path:`, colors.yellow);
    log(`    ${colors.dim}${existing.args?.[0]}${colors.reset}`);

    const answer = await prompt(`  Update to new path? [Y/n] `);
    if (answer === 'n' || answer === 'no') {
      log(`  Skipped`);
      return false;
    }
  }

  // Add/update the config
  if (!config.mcpServers) {
    config.mcpServers = {};
  }
  config.mcpServers.paparazzi = PAPARAZZI_CONFIG;

  // Write config
  try {
    writeJsonFile(configPath, config);
    log(`  ${colors.green}✓ Configured successfully${colors.reset}`);
    return true;
  } catch (err) {
    log(`  ${colors.red}✗ Failed to write config: ${err.message}${colors.reset}`);
    return false;
  }
}

async function main() {
  log('\n📸 Paparazzi Setup Wizard\n', colors.cyan);
  log(`Server path: ${colors.dim}${SERVER_PATH}${colors.reset}`);

  // Check if server is built
  if (!fs.existsSync(SERVER_PATH)) {
    log(`\n${colors.red}✗ MCP server not built. Run 'make build' first.${colors.reset}`);
    process.exit(1);
  }

  // Ask which apps to configure
  log('\nWhich apps do you want to configure?\n');
  log('  1. Claude Code only');
  log('  2. Claude Desktop only');
  log('  3. Both');
  log('');

  const choice = await prompt('Enter choice [1/2/3]: ');

  const apps = [];
  if (choice === '1' || choice === '3') apps.push('Claude Code');
  if (choice === '2' || choice === '3') apps.push('Claude Desktop');

  if (apps.length === 0) {
    apps.push('Claude Code'); // Default
  }

  let successCount = 0;
  for (const app of apps) {
    const success = await configureApp(app);
    if (success) successCount++;
  }

  // Summary
  log('\n' + '─'.repeat(50));

  if (successCount > 0) {
    log(`\n${colors.green}✓ Setup complete!${colors.reset}\n`);
    log('Next steps:');
    log('  1. Load the Chrome extension:');
    log('     chrome://extensions → Load unpacked → packages/extension');
    log('  2. Restart Claude Desktop/Code');
    log('  3. Ask Claude to "take a screenshot"\n');
  } else {
    log(`\n${colors.yellow}No changes made.${colors.reset}\n`);
  }
}

main().catch(console.error);
