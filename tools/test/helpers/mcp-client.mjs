// A minimal MCP client over stdio: starts a server, sends `initialize` and
// `tools/list`, and returns the server name and its tool names
import { spawn } from 'node:child_process';
import readline from 'node:readline';

export function probeServer({ command, args = [], cwd, env = {}, timeoutMs = 20000 }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const fail = (error) => {
      clearTimeout(timer);
      child.kill();
      reject(new Error(`${error.message}\n${command} ${args.join(' ')}\nstderr: ${stderr}`));
    };
    const timer = setTimeout(() => fail(new Error('timed out')), timeoutMs);

    const waiting = new Map();
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      let message;
      try { message = JSON.parse(line); } catch { return; }
      waiting.get(message.id)?.(message);
    });
    child.on('error', fail);
    child.on('exit', (code) => { if (waiting.size) { fail(new Error(`server exited (${code}) before answering`)); } });

    const send = (message) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
    const request = (id, method, params) => new Promise((answer) => {
      waiting.set(id, (message) => { waiting.delete(id); answer(message); });
      send({ id, method, params });
    });

    (async () => {
      const init = await request(1, 'initialize', {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'rave-agents-test', version: '0' },
      });
      send({ method: 'notifications/initialized' });
      const list = await request(2, 'tools/list', {});
      clearTimeout(timer);
      // Return once the server is gone: Windows cannot delete the folder a
      // running process works in, and the tests delete theirs afterwards
      const exited = new Promise((done) => child.once('exit', (code) => done(code)));
      child.stdin.end();
      const stop = setTimeout(() => child.kill(), 3000);
      const exitCode = await exited;
      clearTimeout(stop);
      resolve({
        serverName: init.result?.serverInfo?.name,
        tools: (list.result?.tools ?? []).map((tool) => tool.name),
        exitCode,
      });
    })().catch(fail);
  });
}
