#!/usr/bin/env node
// Print the MCP server settings for installing rave-agents by hand, with
// absolute paths into this copy of the repository and to `node` on PATH:
//
//   node tools/mcp-config.mjs <app>
//
// The settings go to stdout, where to put them to stderr. See INSTALLATION.md.
import { readFileSync, statSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APPS, configHint, mcpConfig } from './lib/mcp-config.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = process.argv[2];

// The node on PATH, as the user would type it: process.execPath is the
// resolved location, which for Homebrew is a versioned folder that an
// upgrade removes
function nodeOnPath() {
  const names = process.platform === 'win32' ? ['node.exe'] : ['node'];
  for (const dir of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    for (const name of names) {
      try {
        if (statSync(join(dir, name)).isFile()) { return join(dir, name); }
      } catch { /* not here */ }
    }
  }
  return process.execPath;
}

if (!app || app === '--help' || app === '-h') {
  process.stdout.write(`Usage: node tools/mcp-config.mjs <app>\n\nApps: ${APPS.join(', ')}\n`);
  process.exitCode = app ? 0 : 2;
} else {
  try {
    const bundle = JSON.parse(readFileSync(resolve(root, 'tools/bundle.json'), 'utf8'));
    process.stdout.write(mcpConfig(app, { bundle, root, node: nodeOnPath() }));
    process.stderr.write(`${configHint(app)}\n`);
  } catch (error) {
    process.stderr.write(`mcp-config: ${error.message}\n`);
    process.exitCode = 2;
  }
}
