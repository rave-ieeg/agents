// The work behind tools/sync.mjs: copy the upstream files into the plugin,
// write every host's manifest, and keep tools/sources.lock.json.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fetchSource, listFiles } from './git.mjs';
import { manifestFiles } from './manifests.mjs';

// Folders that sync owns: emptied and rewritten on every sync
export const GENERATED = ['skills', 'servers'];
const BUNDLE = 'tools/bundle.json';
const LOCK = 'tools/sources.lock.json';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const toJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const short = (sha) => sha.slice(0, 7);

// Files under `base`, as '/'-separated paths relative to it
function walk(base) {
  if (!existsSync(base)) { return []; }
  return readdirSync(base, { recursive: true })
    .filter((path) => statSync(join(base, path)).isFile())
    .map((path) => path.split(sep).join('/'));
}

// Like listFiles(), for files of this repository (bundle.json `localFiles`)
function listDisk(dir, from) {
  const path = join(dir, from);
  if (!existsSync(path)) { return []; }
  return statSync(path).isDirectory() ? walk(path) : [''];
}

function checkDestinations(bundle) {
  const copies = [...(bundle.localFiles ?? []), ...bundle.sources.flatMap((source) => source.copy)];
  for (const { to } of copies) {
    const parts = to.split('/');
    if (!GENERATED.includes(parts[0]) || parts.length < 2 || parts.some((part) => part === '' || part === '..')) {
      throw new Error(`"${to}": copies must go into ${GENERATED.map((dir) => `${dir}/`).join(' or ')}`);
    }
  }
}

// The files `copies` take from `dir`, keyed by their destination
function collect(files, dir, copies, label, list) {
  for (const { from, to } of copies) {
    const paths = list(dir, from);
    if (!paths.length) { throw new Error(`${label}: nothing to copy at "${from}"`); }
    for (const path of paths) {
      files.set(path ? `${to}/${path}` : to, readFileSync(join(dir, from, path)));
    }
  }
}

const manifests = (bundle) => new Map([...manifestFiles(bundle)].map(([path, text]) => [path, Buffer.from(text)]));

// Changes whenever the plugin's content would: the synced files, and the
// manifests apart from their version
function contentHash(bundle, synced) {
  const unversioned = { ...bundle, plugin: { ...bundle.plugin, version: '0.0.0' } };
  const files = new Map([...synced, ...manifests(unversioned)]);
  const hash = createHash('sha256');
  for (const path of [...files.keys()].sort()) {
    hash.update(path).update('\0').update(files.get(path)).update('\0');
  }
  return `sha256-${hash.digest('hex')}`;
}

export function bumpPatch(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) { throw new Error(`cannot bump version "${version}": use x.y.z in ${BUNDLE}`); }
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

function compare(root, files) {
  const problems = [];
  for (const [path, content] of files) {
    const target = join(root, path);
    if (!existsSync(target)) {
      problems.push(`missing: ${path}`);
    } else if (!readFileSync(target).equals(content)) {
      problems.push(`differs from upstream or bundle.json: ${path}`);
    }
  }
  for (const dir of GENERATED) {
    for (const path of walk(join(root, dir))) {
      if (!files.has(`${dir}/${path}`)) { problems.push(`not from upstream: ${dir}/${path}`); }
    }
  }
  return problems;
}

function report(log, bundle, lock, sources, version) {
  for (const [id, { repo, sha }] of Object.entries(sources)) {
    const before = lock?.sources?.[id]?.sha;
    if (before === sha) {
      log(`${id}: unchanged (${short(sha)})`);
    } else {
      const compareUrl = before && repo ? ` https://github.com/${repo}/compare/${before}...${sha}` : '';
      log(`${id}: ${before ? short(before) : 'new'} -> ${short(sha)}${compareUrl}`);
    }
  }
  const before = lock?.version;
  log(before && before !== version ? `${bundle.plugin.name}: ${before} -> ${version}` : `${bundle.plugin.name}: ${version}`);
}

// mode: 'update' (upstream branches), 'local' (the clones at `localPath`),
// or 'check' (the locked commits, compared with the files on disk)
export function sync({ root, mode = 'update', log = console.log }) {
  const bundle = readJson(join(root, BUNDLE));
  checkDestinations(bundle);
  const lock = existsSync(join(root, LOCK)) ? readJson(join(root, LOCK)) : null;
  if (mode === 'check' && !lock) { return { problems: [`${LOCK} is missing: run node tools/sync.mjs`] }; }

  const tmp = mkdtempSync(join(tmpdir(), 'rave-agents-sync-'));
  try {
    const synced = new Map();
    const sources = {};
    collect(synced, root, bundle.localFiles ?? [], BUNDLE, listDisk);
    for (const source of bundle.sources) {
      let dir;
      if (mode === 'local') {
        dir = resolve(root, source.localPath);
      } else {
        const at = mode === 'check' ? lock.sources?.[source.id]?.sha : source.ref;
        if (!at) { return { problems: [`${source.id} is not in ${LOCK}: run node tools/sync.mjs`] }; }
        const fetched = fetchSource(source, at, tmp);
        dir = fetched.dir;
        sources[source.id] = { repo: source.repo, ref: source.ref, sha: fetched.sha, committed: fetched.committed };
      }
      collect(synced, dir, source.copy, source.id, listFiles);
    }

    const hash = contentHash(bundle, synced);
    if (mode === 'check') {
      const problems = compare(root, new Map([...synced, ...manifests(bundle)]));
      if (hash !== lock.contentHash) { problems.push(`content differs from ${LOCK}: run node tools/sync.mjs`); }
      if (bundle.plugin.version !== lock.version) {
        problems.push(`version ${bundle.plugin.version} in ${BUNDLE} was not synced (lock: ${lock.version}): run node tools/sync.mjs`);
      }
      return { problems };
    }

    let version = bundle.plugin.version;
    if (mode === 'update' && lock && hash !== lock.contentHash && version === lock.version) {
      version = bumpPatch(version);
      bundle.plugin.version = version;
      writeFileSync(join(root, BUNDLE), toJson(bundle));
    }
    for (const dir of GENERATED) { rmSync(join(root, dir), { recursive: true, force: true }); }
    for (const [path, content] of [...synced, ...manifests(bundle)]) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    if (mode === 'local') {
      log('Copied from your local clones. Lock and version unchanged: do not commit this.');
      return { changed: true };
    }
    // Upstream branches move every day; the lock changes only with what we
    // copy, so its older commits still reproduce these files
    const changed = !lock || hash !== lock.contentHash || version !== lock.version;
    if (!changed) {
      log(`Nothing to update: the copied files are unchanged (${bundle.plugin.name} ${version}).`);
      return { changed };
    }
    writeFileSync(join(root, LOCK), toJson({ version, contentHash: hash, sources }));
    report(log, bundle, lock, sources, version);
    return { changed };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
