// Throwaway upstream repositories and plugin roots for the sync tests
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const git = (dir, ...args) => execFileSync('git', [
  '-c', 'user.name=test', '-c', 'user.email=test@example.org', '-c', 'commit.gpgsign=false',
  '-C', dir, ...args,
], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

export function writeFiles(dir, files) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
}

export function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'rave-agents-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// A git repository with `files` committed on `main`; returns its file URL
export function makeUpstream(dir, files) {
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'uploadpack.allowFilter', 'true');
  git(dir, 'config', 'uploadpack.allowAnySHA1InWant', 'true');
  writeFiles(dir, files);
  commitAll(dir, 'initial');
  return pathToFileURL(dir).href;
}

export function commitAll(dir, message) {
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', message);
  return git(dir, 'rev-parse', 'HEAD');
}

export function testBundle(sources, version = '0.1.0') {
  return {
    marketplace: { name: 'market', displayName: 'Market', description: 'Market description', owner: { name: 'owner' } },
    plugin: {
      name: 'demo-plugin',
      displayName: 'Demo Plugin',
      version,
      description: 'Demo description',
      author: { name: 'someone' },
      homepage: 'https://example.org',
      repository: 'https://github.com/example/demo',
      license: 'GPL-3.0',
      keywords: ['demo'],
      category: 'productivity',
    },
    mcpServers: { alpha: { script: 'servers/alpha/server.mjs', args: [] } },
    localFiles: [{ from: 'tools/licenses/LICENSE.txt', to: 'servers/alpha/LICENSE' }],
    sources,
  };
}

// A plugin root holding `bundle` as tools/bundle.json
export function makeRoot(dir, bundle) {
  writeFiles(dir, {
    'tools/bundle.json': `${JSON.stringify(bundle, null, 2)}\n`,
    'tools/licenses/LICENSE.txt': 'local license\n',
  });
  return dir;
}
