#!/usr/bin/env node
// Update the rave-agents plugin from its upstream repositories, as listed in
// tools/bundle.json: copy their files into skills/ and servers/, rewrite
// every agent host's manifest, and record the upstream commits in
// tools/sources.lock.json.
//
//   node tools/sync.mjs           update from the upstream branches; bumps the
//                                 patch version when anything changed
//   node tools/sync.mjs --local   copy from your clones next to this repository
//                                 (bundle.json `localPath`), uncommitted work
//                                 included, to try it out; the lock and version
//                                 stay as they are, so don't commit the result
//   node tools/sync.mjs --check   check that the files match the lock and
//                                 bundle.json; exits 1 when they don't
//
// --root <dir> runs on another copy of this repository (used by the tests).
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { sync } from './lib/sync.mjs';

const HELP = `Usage: node tools/sync.mjs [--local | --check]

  (no option)  update from the upstream branches in tools/bundle.json
  --local      copy from your local clones (bundle.json localPath); don't commit
  --check      check the files against tools/sources.lock.json; exit 1 if stale
`;

function main() {
  const { values } = parseArgs({
    options: {
      local: { type: 'boolean' },
      check: { type: 'boolean' },
      root: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) { process.stdout.write(HELP); return 0; }
  if (values.local && values.check) { throw new Error('use either --local or --check'); }

  const root = values.root ? resolve(values.root) : resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const mode = values.check ? 'check' : values.local ? 'local' : 'update';
  const result = sync({ root, mode, log: (line) => process.stdout.write(`${line}\n`) });
  if (mode === 'check') {
    if (result.problems.length) {
      process.stderr.write(`Out of date:\n${result.problems.map((p) => `  ${p}`).join('\n')}\n`);
      return 1;
    }
    process.stdout.write('Up to date.\n');
  }
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  process.stderr.write(`sync: ${error.message}\n`);
  process.exitCode = 1;
}
