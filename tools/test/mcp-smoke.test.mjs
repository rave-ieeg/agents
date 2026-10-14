// Starts every MCP server the way each agent host would, from the committed
// manifests, and checks that it answers. Needs neither R nor a running app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { probeServer } from './helpers/mcp-client.mjs';
import { tempDir } from './helpers/fixture.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const manifest = (path) => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));

// Tools each server lists before any app or viewer is attached
const EXPECTED_TOOLS = {
  shidashi: ['shidashi_launchers', 'shidashi_connect'],
  threebrain: ['hub_status', 'list_viewers', 'capture_screenshot'],
};

// shidashi: an empty cache folder (no apps) and no call log
const isolate = (t) => ({ SHIDASHI_CACHE_DIR: tempDir(t), SHIDASHI_MCP_LOG: 'false' });

// How each host turns its manifest entry into a process
const HOSTS = {
  'Claude Code (.claude-plugin/plugin.json)': {
    servers: () => manifest('.claude-plugin/plugin.json').mcpServers,
    // Claude Code starts servers in the user's project folder
    launch: (server, t) => ({
      command: server.command,
      args: server.args.map((arg) => arg.replaceAll('${CLAUDE_PLUGIN_ROOT}', ROOT)),
      cwd: tempDir(t),
    }),
  },
  'Agent Plugins (mcp.json)': {
    servers: () => manifest('mcp.json').mcpServers,
    // a plugin-relative cwd is resolved against the plugin root
    launch: (server) => ({ command: server.command, args: server.args, cwd: resolve(ROOT, server.cwd) }),
  },
  'Gemini CLI (gemini-extension.json)': {
    servers: () => manifest('gemini-extension.json').mcpServers,
    launch: (server) => {
      const expand = (text) => text.replaceAll('${extensionPath}', ROOT).replaceAll('${/}', sep);
      return { command: server.command, args: server.args.map(expand), cwd: expand(server.cwd) };
    },
  },
};

for (const [host, { servers, launch }] of Object.entries(HOSTS)) {
  test(`${host}: every server starts and lists its tools`, async (t) => {
    const entries = Object.entries(servers());
    assert.deepEqual(entries.map(([name]) => name).sort(), Object.keys(EXPECTED_TOOLS).sort());
    for (const [name, server] of entries) {
      const { tools } = await probeServer({ ...launch(server, t), env: isolate(t) });
      for (const tool of EXPECTED_TOOLS[name]) {
        assert.ok(tools.includes(tool), `${name} lacks ${tool}; it lists: ${tools.join(', ')}`);
      }
    }
  });
}
