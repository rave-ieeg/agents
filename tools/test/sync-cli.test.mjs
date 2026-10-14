import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRoot, makeUpstream, tempDir, testBundle, writeFiles } from './helpers/fixture.mjs';

const CLI = fileURLToPath(new URL('../sync.mjs', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

function setup(t) {
  const dir = tempDir(t);
  const url = makeUpstream(join(dir, 'up'), { 'lib/server.mjs': 'server\n' });
  const copy = [{ from: 'lib/server.mjs', to: 'servers/alpha/server.mjs' }];
  return makeRoot(join(dir, 'root'), testBundle([{ id: 'up', repo: 'example/up', url, ref: 'main', localPath: '../up', copy }]));
}

test('sync reports each source and exits 0', (t) => {
  const root = setup(t);
  const result = run('--root', root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^up: new -> [0-9a-f]{7}$/m);
  assert.equal(readFileSync(join(root, 'servers/alpha/server.mjs'), 'utf8'), 'server\n');
});

test('--check exits 0 when the files match the lock', (t) => {
  const root = setup(t);
  run('--root', root);
  const result = run('--root', root, '--check');
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('--check exits 1 and names the stale file', (t) => {
  const root = setup(t);
  run('--root', root);
  writeFiles(root, { 'servers/alpha/server.mjs': 'edited\n' });
  const result = run('--root', root, '--check');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /servers\/alpha\/server\.mjs/);
});

test('a failing sync exits 1 with the reason', (t) => {
  const root = setup(t);
  writeFiles(root, { 'tools/bundle.json': '{ not json' });
  const result = run('--root', root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /bundle\.json|JSON/);
});
