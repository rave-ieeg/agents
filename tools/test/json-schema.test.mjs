import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkSchema } from '../lib/json-schema.mjs';

const schemaDir = new URL('../schemas/agent-plugins-1.0.0/', import.meta.url);
const pluginSchema = JSON.parse(readFileSync(new URL('plugin.schema.json', schemaDir), 'utf8'));
const mcpSchema = JSON.parse(readFileSync(new URL('mcp.schema.json', schemaDir), 'utf8'));

const PLUGIN_SCHEMA_ID = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';
const MCP_SCHEMA_ID = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json';

const validPlugin = {
  $schema: PLUGIN_SCHEMA_ID,
  name: 'rave-agents',
  version: '0.1.0',
  author: { name: 'rave-ieeg', url: 'https://rave.wiki' },
  keywords: ['rave'],
  extensions: { 'com.openai': { interface: { displayName: 'RAVE Agents' } } },
};

const stdioServer = { type: 'stdio', command: 'node', args: ['./servers/x.mjs'], cwd: './' };

// every reported problem starts with the JSON path of the offending value
const paths = (errors) => errors.map((e) => e.split(':')[0]);

test('a valid plugin manifest has no problems', () => {
  assert.deepEqual(checkSchema(pluginSchema, validPlugin), []);
});

test('an unknown top-level manifest field is reported', () => {
  assert.deepEqual(paths(checkSchema(pluginSchema, { ...validPlugin, displayName: 'RAVE' })), ['/displayName']);
});

test('an unknown author field is reported', () => {
  const errors = checkSchema(pluginSchema, { ...validPlugin, author: { name: 'x', twitter: '@x' } });
  assert.deepEqual(paths(errors), ['/author/twitter']);
});

test('a plugin name that breaks the name pattern is reported', () => {
  for (const name of ['Rave', 'rave--agents', 'rave_agents', '-rave']) {
    assert.deepEqual(paths(checkSchema(pluginSchema, { ...validPlugin, name })), ['/name'], name);
  }
});

test('missing required fields and a wrong $schema are reported', () => {
  assert.deepEqual(paths(checkSchema(pluginSchema, { name: 'rave-agents' })), ['/$schema']);
  assert.deepEqual(paths(checkSchema(pluginSchema, { ...validPlugin, $schema: MCP_SCHEMA_ID })), ['/$schema']);
});

test('a keyword that is not a string is reported', () => {
  assert.deepEqual(paths(checkSchema(pluginSchema, { ...validPlugin, keywords: ['rave', 3] })), ['/keywords/1']);
});

test('a stdio server with a plugin-relative cwd is valid', () => {
  assert.deepEqual(checkSchema(mcpSchema, { $schema: MCP_SCHEMA_ID, mcpServers: { a: stdioServer } }), []);
});

test('a cwd that is not plugin-relative is reported', () => {
  for (const cwd of ['.', 'servers', '/tmp', '${CLAUDE_PLUGIN_ROOT}']) {
    const errors = checkSchema(mcpSchema, { $schema: MCP_SCHEMA_ID, mcpServers: { a: { ...stdioServer, cwd } } });
    assert.deepEqual(paths(errors), ['/mcpServers/a'], cwd);
  }
});

test('a server without a transport type is reported', () => {
  const { type, ...untyped } = stdioServer;
  const errors = checkSchema(mcpSchema, { $schema: MCP_SCHEMA_ID, mcpServers: { a: untyped } });
  assert.deepEqual(paths(errors), ['/mcpServers/a']);
});

test('an env that sets PLUGIN_ROOT is reported', () => {
  const server = { ...stdioServer, env: { PLUGIN_ROOT: '/x' } };
  const errors = checkSchema(mcpSchema, { $schema: MCP_SCHEMA_ID, mcpServers: { a: server } });
  assert.deepEqual(paths(errors), ['/mcpServers/a']);
});

// A future schema version may use keywords this checker lacks; ignoring them
// would pass manifests the real schema rejects
test('a schema keyword the checker does not implement is refused, not ignored', () => {
  assert.throws(() => checkSchema({ type: 'string', format: 'uri' }, 'x'), /format/);
  assert.throws(() => checkSchema({ properties: { a: { minimum: 1 } } }, { a: 0 }), /minimum/);
});
