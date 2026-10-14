import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { probeServer } from './helpers/mcp-client.mjs';
import { tempDir } from './helpers/fixture.mjs';

// Answers initialize and tools/list, then takes a while to exit after its
// input closes, as a real server may
const SLOW_SERVER = `
import readline from 'node:readline';
const send = (message) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\\n');
readline.createInterface({ input: process.stdin })
  .on('line', (line) => {
    const { id, method } = JSON.parse(line);
    if (method === 'initialize') send({ id, result: { serverInfo: { name: 'slow' } } });
    if (method === 'tools/list') send({ id, result: { tools: [{ name: 'wait' }] } });
  })
  .on('close', () => setTimeout(() => process.exit(0), 300));
`;

// Windows cannot delete a folder that a running process works in, so the
// tests' temporary folders must outlive the servers they start
test('the probe returns only after the server has exited', async (t) => {
  const dir = tempDir(t);
  writeFileSync(join(dir, 'slow.mjs'), SLOW_SERVER);
  const result = await probeServer({ command: process.execPath, args: ['slow.mjs'], cwd: dir });
  assert.deepEqual(result.tools, ['wait']);
  assert.equal(result.exitCode, 0);
});
