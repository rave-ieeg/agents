import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { manifestFiles } from '../lib/manifests.mjs';
import { checkSchema } from '../lib/json-schema.mjs';

const schemaDir = new URL('../schemas/agent-plugins-1.0.0/', import.meta.url);
const schema = (name) => JSON.parse(readFileSync(new URL(name, schemaDir), 'utf8'));

// A hand-written bundle; expectations below are literals, not generator output
const bundle = {
  marketplace: { name: 'market', displayName: 'Market', description: 'Market description', owner: { name: 'owner' } },
  plugin: {
    name: 'demo-plugin',
    displayName: 'Demo Plugin',
    version: '1.2.3',
    description: 'Demo description',
    author: { name: 'someone', url: 'https://example.org' },
    homepage: 'https://example.org',
    repository: 'https://github.com/example/demo',
    license: 'GPL-3.0',
    keywords: ['demo'],
    category: 'productivity',
  },
  mcpServers: {
    alpha: { script: 'servers/alpha/alpha.mjs', args: [] },
    beta: { script: 'servers/beta/beta.mjs', args: ['mcp'] },
  },
  sources: [],
};

const generate = (b = bundle) => {
  const files = manifestFiles(b);
  return Object.fromEntries([...files].map(([path, text]) => [path, JSON.parse(text)]));
};

test('every host manifest is generated', () => {
  assert.deepEqual([...manifestFiles(bundle).keys()].sort(), [
    '.agents/plugins/marketplace.json',
    '.claude-plugin/marketplace.json',
    '.claude-plugin/plugin.json',
    'gemini-extension.json',
    'mcp.json',
    'plugin.json',
  ]);
});

// Inline, not a root .mcp.json: Claude Code and Copilot CLI would also read
// that file as the MCP config of anyone working inside this repository
test('Claude Code starts each server from ${CLAUDE_PLUGIN_ROOT}, declared in its plugin.json', () => {
  assert.deepEqual(generate()['.claude-plugin/plugin.json'].mcpServers, {
    alpha: { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/servers/alpha/alpha.mjs'] },
    beta: { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/servers/beta/beta.mjs', 'mcp'] },
  });
});

test('Agent Plugins mcp.json runs servers from the plugin root and passes the official schema', () => {
  const mcp = generate()['mcp.json'];
  assert.deepEqual(checkSchema(schema('mcp.schema.json'), mcp), []);
  assert.deepEqual(mcp.mcpServers.beta, { type: 'stdio', command: 'node', args: ['./servers/beta/beta.mjs', 'mcp'], cwd: './' });
});

test('Agent Plugins plugin.json passes the official schema', () => {
  const manifest = generate()['plugin.json'];
  assert.deepEqual(checkSchema(schema('plugin.schema.json'), manifest), []);
  assert.equal(manifest.name, 'demo-plugin');
  assert.equal(manifest.license, 'GPL-3.0');
});

test('Gemini starts each server from ${extensionPath}', () => {
  const gemini = generate()['gemini-extension.json'];
  assert.equal(gemini.name, 'demo-plugin');
  assert.deepEqual(gemini.mcpServers.beta, {
    command: 'node',
    args: ['${extensionPath}${/}servers${/}beta${/}beta.mjs', 'mcp'],
    cwd: '${extensionPath}',
  });
});

test('the Claude marketplace lists the repository root as the plugin, without a version', () => {
  const market = generate()['.claude-plugin/marketplace.json'];
  assert.equal(market.name, 'market');
  assert.deepEqual(market.owner, { name: 'owner' });
  assert.equal(market.plugins.length, 1);
  const [entry] = market.plugins;
  assert.equal(entry.name, 'demo-plugin');
  assert.equal(entry.source, './');
  assert.equal('version' in entry, false);
});

test('the Codex marketplace lists the repository root as an available local plugin', () => {
  const [entry] = generate()['.agents/plugins/marketplace.json'].plugins;
  assert.deepEqual(entry.source, { source: 'local', path: './' });
  assert.equal(entry.name, 'demo-plugin');
  assert.equal(entry.policy.installation, 'AVAILABLE');
  assert.equal(entry.category, 'Productivity');
});

test('every manifest that carries a version carries the bundle version', () => {
  const files = generate({ ...bundle, plugin: { ...bundle.plugin, version: '9.9.9' } });
  for (const path of ['.claude-plugin/plugin.json', 'plugin.json', 'gemini-extension.json']) {
    assert.equal(files[path].version, '9.9.9', path);
  }
});

// The sync workflow publishes these without a person looking: a bundle.json
// edit that breaks the schema (an extra author field, say) must fail here
test('the committed Agent Plugins manifests pass the official schemas', () => {
  const committed = (name) => JSON.parse(readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8'));
  assert.deepEqual(checkSchema(schema('plugin.schema.json'), committed('plugin.json')), []);
  assert.deepEqual(checkSchema(schema('mcp.schema.json'), committed('mcp.json')), []);
});
