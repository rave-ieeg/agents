// Reading files from the upstream git repositories
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';

export const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  maxBuffer: 64 * 1024 * 1024,
});

// A shallow, sparse checkout of `at` (a branch or a commit) holding only the
// paths the source copies; other files are never downloaded
export function fetchSource(source, at, tmp) {
  const dir = mkdtempSync(join(tmp, `${source.id}-`));
  git(dir, 'init', '-q');
  git(dir, 'remote', 'add', 'origin', source.url ?? `https://github.com/${source.repo}.git`);
  git(dir, 'fetch', '-q', '--depth', '1', '--filter=blob:none', 'origin', at);
  git(dir, 'sparse-checkout', 'set', '--no-cone', ...source.copy.map(({ from }) => `/${from}`));
  // Keep upstream's line endings: Windows git converts LF to CRLF on
  // checkout by default (core.autocrlf), which would change every file
  git(dir, '-c', 'core.autocrlf=false', 'checkout', '-q', 'FETCH_HEAD');
  const [sha, committed] = git(dir, 'log', '-1', '--format=%H%n%cI').trim().split('\n');
  return { dir, sha, committed };
}

// The files at `from` (a file or a folder) that git tracks or would track,
// as paths relative to `from` ('' when `from` is a file). Files deleted from
// the working tree are left out, so a local clone counts as it is on disk.
export function listFiles(dir, from) {
  return git(dir, 'ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', from)
    .split('\0')
    .filter((path) => path && existsSync(join(dir, path)))
    .map((path) => (path === from ? '' : path.slice(from.length + 1)));
}
