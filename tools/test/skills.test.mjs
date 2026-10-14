// The synced skills follow the Agent Skills format every host loads
// (https://agentskills.io/specification), and carry their license.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILLS = fileURLToPath(new URL('../../skills', import.meta.url));
const skillNames = () => (existsSync(SKILLS) ? readdirSync(SKILLS, { withFileTypes: true }) : [])
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name);

// The `key: value` lines of a SKILL.md front matter (quotes removed)
function frontMatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  assert.ok(match, 'SKILL.md must start with a --- front matter block');
  return Object.fromEntries(match[1].split(/\r?\n/)
    .map((line) => /^([A-Za-z_-]+):\s*(.*)$/.exec(line))
    .filter(Boolean)
    .map(([, key, value]) => [key, value.replace(/^(['"])(.*)\1$/, '$2')]));
}

test('the plugin has skills', () => {
  assert.ok(skillNames().length > 0, `no skills in ${SKILLS}: run node tools/sync.mjs`);
});

for (const name of skillNames()) {
  test(`skill ${name}: front matter names the skill and describes it`, () => {
    const meta = frontMatter(readFileSync(join(SKILLS, name, 'SKILL.md'), 'utf8'));
    assert.equal(meta.name, name, 'name must match the folder name');
    assert.match(meta.name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(meta.name.length <= 64);
    assert.ok(meta.description && meta.description.length <= 1024, 'description must have 1-1024 characters');
  });

  test(`skill ${name}: carries a license file`, () => {
    assert.ok(readdirSync(join(SKILLS, name)).some((file) => /^licen[cs]e/i.test(file)));
  });
}
