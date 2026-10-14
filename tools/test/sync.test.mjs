import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sync } from '../lib/sync.mjs';
import { commitAll, git, makeRoot, makeUpstream, tempDir, testBundle, writeFiles } from './helpers/fixture.mjs';

const UPSTREAM_FILES = {
  'lib/server.mjs': 'server v1\n',
  'skills/demo/SKILL.md': '---\nname: demo\ndescription: Demo skill\n---\n',
  'skills/demo/scripts/run.R': 'cat("run")\n',
  'LICENSE': 'upstream license\n',
  'unrelated/big.bin': 'not copied\n',
};

const COPY = [
  { from: 'lib/server.mjs', to: 'servers/alpha/server.mjs' },
  { from: 'skills/demo', to: 'skills/demo' },
  { from: 'LICENSE', to: 'skills/demo/LICENSE' },
];

// One upstream repository and a plugin root that syncs from it
function setup(t, { copy = COPY, version } = {}) {
  const dir = tempDir(t);
  const upstream = join(dir, 'up');
  const url = makeUpstream(upstream, UPSTREAM_FILES);
  const root = makeRoot(join(dir, 'root'), testBundle([{ id: 'up', url, ref: 'main', localPath: '../up', copy }], version));
  return { upstream, root };
}

const read = (root, path) => readFileSync(join(root, path), 'utf8');
const readJson = (root, path) => JSON.parse(read(root, path));
const quiet = () => {};

test('update copies the upstream files and records the upstream commit', (t) => {
  const { upstream, root } = setup(t);
  sync({ root, mode: 'update', log: quiet });

  assert.equal(read(root, 'servers/alpha/server.mjs'), 'server v1\n');
  assert.equal(read(root, 'skills/demo/scripts/run.R'), 'cat("run")\n');
  assert.equal(read(root, 'skills/demo/LICENSE'), 'upstream license\n');
  assert.equal(read(root, 'servers/alpha/LICENSE'), 'local license\n');
  assert.equal(existsSync(join(root, 'unrelated')), false);
  assert.equal(readJson(root, 'tools/sources.lock.json').sources.up.sha, git(upstream, 'rev-parse', 'HEAD'));
  assert.equal(readJson(root, '.claude-plugin/plugin.json').version, '0.1.0');
  assert.deepEqual(readJson(root, '.claude-plugin/plugin.json').mcpServers.alpha.args, ['${CLAUDE_PLUGIN_ROOT}/servers/alpha/server.mjs']);
});

test('an upstream change bumps the patch version in bundle.json and every manifest', (t) => {
  const { upstream, root } = setup(t);
  sync({ root, mode: 'update', log: quiet });
  writeFiles(upstream, { 'lib/server.mjs': 'server v2\n' });
  const sha = commitAll(upstream, 'v2');
  sync({ root, mode: 'update', log: quiet });

  assert.equal(read(root, 'servers/alpha/server.mjs'), 'server v2\n');
  assert.equal(readJson(root, 'tools/sources.lock.json').sources.up.sha, sha);
  assert.equal(readJson(root, 'tools/bundle.json').plugin.version, '0.1.1');
  assert.equal(readJson(root, '.claude-plugin/plugin.json').version, '0.1.1');
  assert.equal(readJson(root, 'gemini-extension.json').version, '0.1.1');
});

test('a sync with no upstream change keeps the version', (t) => {
  const { root } = setup(t);
  sync({ root, mode: 'update', log: quiet });
  sync({ root, mode: 'update', log: quiet });
  assert.equal(readJson(root, 'tools/bundle.json').plugin.version, '0.1.0');
});

test('a version set by hand is not bumped again', (t) => {
  const { upstream, root } = setup(t);
  sync({ root, mode: 'update', log: quiet });
  const bundle = readJson(root, 'tools/bundle.json');
  bundle.plugin.version = '0.2.0';
  writeFileSync(join(root, 'tools/bundle.json'), JSON.stringify(bundle, null, 2));
  writeFiles(upstream, { 'lib/server.mjs': 'server v2\n' });
  commitAll(upstream, 'v2');
  sync({ root, mode: 'update', log: quiet });
  assert.equal(readJson(root, 'tools/bundle.json').plugin.version, '0.2.0');
  assert.equal(readJson(root, 'plugin.json').version, '0.2.0');
});

test('a file removed upstream disappears from the bundle', (t) => {
  const { upstream, root } = setup(t);
  sync({ root, mode: 'update', log: quiet });
  rmSync(join(upstream, 'skills/demo/scripts/run.R'));
  commitAll(upstream, 'remove run.R');
  sync({ root, mode: 'update', log: quiet });
  assert.equal(existsSync(join(root, 'skills/demo/scripts/run.R')), false);
  assert.equal(existsSync(join(root, 'skills/demo/SKILL.md')), true);
});

test('check passes on a synced tree', (t) => {
  const { root } = setup(t);
  sync({ root, mode: 'update', log: quiet });
  assert.deepEqual(sync({ root, mode: 'check', log: quiet }).problems, []);
});

test('check reports a hand-edited synced file and a stray file', (t) => {
  const { root } = setup(t);
  sync({ root, mode: 'update', log: quiet });
  writeFiles(root, { 'servers/alpha/server.mjs': 'edited\n', 'skills/demo/notes.txt': 'stray\n' });
  const { problems } = sync({ root, mode: 'check', log: quiet });
  assert.equal(problems.length, 2, problems.join('\n'));
  assert.ok(problems.some((p) => p.includes('servers/alpha/server.mjs')));
  assert.ok(problems.some((p) => p.includes('skills/demo/notes.txt')));
});

test('check reports manifests left stale by a bundle.json edit', (t) => {
  const { root } = setup(t);
  sync({ root, mode: 'update', log: quiet });
  const bundle = readJson(root, 'tools/bundle.json');
  bundle.plugin.description = 'changed';
  writeFileSync(join(root, 'tools/bundle.json'), JSON.stringify(bundle, null, 2));
  const { problems } = sync({ root, mode: 'check', log: quiet });
  assert.ok(problems.some((p) => p.includes('.claude-plugin/plugin.json')), problems.join('\n'));
});

test('check reads the locked commit, not the branch head', (t) => {
  const { upstream, root } = setup(t);
  sync({ root, mode: 'update', log: quiet });
  writeFiles(upstream, { 'lib/server.mjs': 'server v2\n' });
  commitAll(upstream, 'v2');
  assert.deepEqual(sync({ root, mode: 'check', log: quiet }).problems, []);
});

test('local copies uncommitted upstream work without touching the lock or version', (t) => {
  const { upstream, root } = setup(t);
  sync({ root, mode: 'update', log: quiet });
  const lock = read(root, 'tools/sources.lock.json');
  writeFiles(upstream, { 'lib/server.mjs': 'work in progress\n' });
  sync({ root, mode: 'local', log: quiet });
  assert.equal(read(root, 'servers/alpha/server.mjs'), 'work in progress\n');
  assert.equal(read(root, 'tools/sources.lock.json'), lock);
  assert.equal(readJson(root, 'tools/bundle.json').plugin.version, '0.1.0');
});

test('a copy whose upstream path is gone stops the sync before anything is written', (t) => {
  const { root } = setup(t, { copy: [...COPY, { from: 'lib/missing.mjs', to: 'servers/alpha/missing.mjs' }] });
  assert.throws(() => sync({ root, mode: 'update', log: quiet }), /lib\/missing\.mjs/);
  assert.equal(existsSync(join(root, 'servers/alpha/server.mjs')), false);
});

test('a destination outside skills/ and servers/ is refused', (t) => {
  const { root } = setup(t, { copy: [{ from: 'LICENSE', to: 'tools/LICENSE' }] });
  assert.throws(() => sync({ root, mode: 'update', log: quiet }), /tools\/LICENSE/);
});

// Windows runners set core.autocrlf=true globally; synced files must keep
// upstream's LF line endings or --check and the version churn
test('synced files keep LF line endings when git converts them on checkout', (t) => {
  const keys = ['GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0'];
  const saved = keys.map((key) => process.env[key]);
  t.after(() => keys.forEach((key, i) => { if (saved[i] === undefined) { delete process.env[key]; } else { process.env[key] = saved[i]; } }));
  const { root } = setup(t);
  Object.assign(process.env, { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.autocrlf', GIT_CONFIG_VALUE_0: 'true' });
  sync({ root, mode: 'update', log: quiet });
  assert.equal(read(root, 'servers/alpha/server.mjs'), 'server v1\n');
});

// Upstream repositories move every day; only a change to what we copy may
// change the lock, or the sync workflow commits every day for nothing
test('an upstream commit that changes no copied file leaves the lock alone', (t) => {
  const { upstream, root } = setup(t);
  sync({ root, mode: 'update', log: quiet });
  const lock = read(root, 'tools/sources.lock.json');
  writeFiles(upstream, { 'unrelated/notes.md': 'notes\n' });
  commitAll(upstream, 'unrelated change');
  assert.equal(sync({ root, mode: 'update', log: quiet }).changed, false);
  assert.equal(read(root, 'tools/sources.lock.json'), lock);
  assert.deepEqual(sync({ root, mode: 'check', log: quiet }).problems, []);
});

test('update restores files left by --local even when nothing changed upstream', (t) => {
  const { upstream, root } = setup(t);
  sync({ root, mode: 'update', log: quiet });
  writeFiles(upstream, { 'lib/server.mjs': 'work in progress\n' });
  sync({ root, mode: 'local', log: quiet });
  git(upstream, 'checkout', '--', 'lib/server.mjs');
  sync({ root, mode: 'update', log: quiet });
  assert.equal(read(root, 'servers/alpha/server.mjs'), 'server v1\n');
});
