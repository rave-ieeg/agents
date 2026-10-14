import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, symlinkSync } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APPS, mcpConfig } from '../lib/mcp-config.mjs';
import { probeServer } from './helpers/mcp-client.mjs';
import { tempDir } from './helpers/fixture.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const CLI = fileURLToPath(new URL('../mcp-config.mjs', import.meta.url));
const bundle = JSON.parse(readFileSync(new URL('../bundle.json', import.meta.url), 'utf8'));
const here = { bundle, root: ROOT, node: process.execPath };

const EXPECTED_TOOLS = { shidashi: 'shidashi_connect', threebrain: 'hub_status' };
const isolate = (t) => ({ SHIDASHI_CACHE_DIR: tempDir(t), SHIDASHI_MCP_LOG: 'false' });

// [section name, {command, args}] pairs from the TOML this helper prints
function parseCodexToml(text) {
  const servers = {};
  let current;
  for (const line of text.split('\n')) {
    const header = /^\[mcp_servers\.([A-Za-z0-9_-]+)\]$/.exec(line);
    if (header) { current = servers[header[1]] = {}; continue; }
    const pair = /^(command|args) = (.*)$/.exec(line);
    if (pair) { current[pair[1]] = JSON.parse(pair[2]); }
  }
  return servers;
}

test('apps that read an mcpServers map get absolute paths that start the servers', async (t) => {
  for (const app of ['claude-desktop', 'cursor', 'gemini', 'antigravity', 'json']) {
    const { mcpServers } = JSON.parse(mcpConfig(app, here));
    assert.deepEqual(Object.keys(mcpServers).sort(), ['shidashi', 'threebrain'], app);
    for (const server of Object.values(mcpServers)) {
      assert.equal(server.command, process.execPath, app);
      assert.ok(isAbsolute(server.args[0]) && existsSync(server.args[0]), `${app}: ${server.args[0]}`);
    }
  }
  const { mcpServers } = JSON.parse(mcpConfig('claude-desktop', here));
  for (const [name, server] of Object.entries(mcpServers)) {
    const { tools } = await probeServer({ ...server, cwd: tempDir(t), env: isolate(t) });
    assert.ok(tools.includes(EXPECTED_TOOLS[name]), `${name}: ${tools.join(', ')}`);
  }
});

test('Copilot CLI entries are local servers with every tool allowed', () => {
  const { mcpServers } = JSON.parse(mcpConfig('copilot', here));
  for (const server of Object.values(mcpServers)) {
    assert.equal(server.type, 'local');
    assert.deepEqual(server.tools, ['*']);
    assert.equal(server.command, process.execPath);
  }
});

test('VS Code entries sit under "servers" as stdio servers', () => {
  const config = JSON.parse(mcpConfig('vscode', here));
  assert.equal('mcpServers' in config, false);
  assert.equal(config.servers.threebrain.type, 'stdio');
  assert.equal(config.servers.threebrain.args.at(-1), 'mcp');
});

test('the Codex TOML starts the servers', async (t) => {
  const servers = parseCodexToml(mcpConfig('codex', here));
  assert.deepEqual(Object.keys(servers).sort(), ['shidashi', 'threebrain']);
  for (const [name, server] of Object.entries(servers)) {
    const { tools } = await probeServer({ ...server, cwd: tempDir(t), env: isolate(t) });
    assert.ok(tools.includes(EXPECTED_TOOLS[name]), `${name}: ${tools.join(', ')}`);
  }
});

test('Windows paths come out as valid TOML and JSON', () => {
  const windows = { bundle, root: 'C:\\Users\\me\\rave agents', node: 'C:\\Program Files\\nodejs\\node.exe', platform: 'win32' };
  const servers = parseCodexToml(mcpConfig('codex', windows));
  assert.equal(servers.shidashi.command, 'C:\\Program Files\\nodejs\\node.exe');
  assert.equal(servers.shidashi.args[0], 'C:\\Users\\me\\rave agents\\servers\\shidashi\\shidashi-proxy.mjs');
  const { mcpServers } = JSON.parse(mcpConfig('claude-desktop', windows));
  assert.equal(mcpServers.threebrain.args[0], 'C:\\Users\\me\\rave agents\\servers\\threebrain\\threebrain-hub.mjs');
});

test('claude mcp add commands survive a POSIX shell, spaces and quotes included', { skip: process.platform === 'win32' }, () => {
  const odd = { bundle, root: "/tmp/Dropbox (Personal)/it's agents", node: '/opt/node 22/bin/node', platform: 'linux' };
  const lines = mcpConfig('claude-code', odd).trim().split('\n');
  assert.equal(lines.length, 2);
  // Swap the claude command for printf to see the words the shell passes on
  const words = execFileSync('/bin/sh', ['-c', lines[1].replace(/^claude mcp add /, "printf '%s\\n' ")], { encoding: 'utf8' });
  assert.deepEqual(words.trim().split('\n'), [
    '--scope', 'user', 'threebrain', '--',
    '/opt/node 22/bin/node', "/tmp/Dropbox (Personal)/it's agents/servers/threebrain/threebrain-hub.mjs", 'mcp',
  ]);
});

test('claude mcp add commands quote Windows paths with double quotes', () => {
  const windows = { bundle, root: 'C:\\rave agents', node: 'C:\\Program Files\\nodejs\\node.exe', platform: 'win32' };
  const [shidashi] = mcpConfig('claude-code', windows).trim().split('\n');
  assert.equal(shidashi, 'claude mcp add --scope user shidashi -- "C:\\Program Files\\nodejs\\node.exe" "C:\\rave agents\\servers\\shidashi\\shidashi-proxy.mjs"');
});

test('an unknown app is refused with the list of apps', () => {
  assert.throws(() => mcpConfig('notepad', here), (error) => APPS.every((app) => error.message.includes(app)));
});

// Homebrew's /opt/homebrew/bin/node links to a versioned Cellar path that
// disappears on upgrade; the link on PATH keeps working
test('the command line names node as found on PATH, not its resolved location', { skip: process.platform === 'win32' }, (t) => {
  const bin = tempDir(t);
  symlinkSync(process.execPath, join(bin, 'node'));
  const env = { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` };
  const result = spawnSync(process.execPath, [CLI, 'json'], { encoding: 'utf8', env });
  assert.equal(JSON.parse(result.stdout).mcpServers.shidashi.command, join(bin, 'node'));
});

test('the command line prints the config on stdout and where it goes on stderr', () => {
  const result = spawnSync(process.execPath, [CLI, 'cursor'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(JSON.parse(result.stdout).mcpServers.shidashi);
  assert.match(result.stderr, /mcp\.json/);
  assert.equal(spawnSync(process.execPath, [CLI, 'notepad'], { encoding: 'utf8' }).status, 2);
});
