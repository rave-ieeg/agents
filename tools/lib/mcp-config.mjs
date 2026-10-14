// MCP server settings for installing by hand: the servers in
// tools/bundle.json, written the way each app's config file expects them,
// with absolute paths into this copy of the repository.
import path from 'node:path';

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const mapOf = (servers, toEntry = (server) => server) =>
  Object.fromEntries(servers.map(([name, server]) => [name, toEntry(server)]));

// POSIX shells: single quotes; Windows (cmd, PowerShell): double quotes
const quote = (word, platform) => (platform === 'win32' ? `"${word}"` : `'${word.replaceAll("'", "'\\''")}'`);

const mcpServers = (servers) => json({ mcpServers: mapOf(servers) });

const FORMATS = {
  'claude-desktop': {
    hint: 'Merge this into claude_desktop_config.json (Claude Desktop: Settings > Developer > Edit Config), then restart Claude Desktop.',
    write: mcpServers,
  },
  'claude-code': {
    hint: 'Run these commands in a terminal, then start a new Claude Code session.',
    write: (servers, platform) => servers.map(([name, { command, args }]) =>
      ['claude mcp add --scope user', name, '--', ...[command, ...args].map((word) => quote(word, platform))].join(' '))
      .join('\n').concat('\n'),
  },
  codex: {
    hint: 'Add this to ~/.codex/config.toml, then restart Codex.',
    // JSON strings and arrays are valid TOML, backslashes included
    write: (servers) => servers.map(([name, { command, args }]) =>
      `[mcp_servers.${name}]\ncommand = ${JSON.stringify(command)}\nargs = ${JSON.stringify(args)}\n`).join('\n'),
  },
  copilot: {
    hint: 'Merge this into ~/.copilot/mcp-config.json, then restart Copilot CLI.',
    write: (servers) => json({ mcpServers: mapOf(servers, (server) => ({ type: 'local', ...server, tools: ['*'] })) }),
  },
  vscode: {
    hint: 'Merge this into your user mcp.json (VS Code or Positron: run "MCP: Open User Configuration"), then start the servers.',
    write: (servers) => json({ servers: mapOf(servers, (server) => ({ type: 'stdio', ...server })) }),
  },
  cursor: { hint: 'Merge this into ~/.cursor/mcp.json, then restart Cursor.', write: mcpServers },
  gemini: { hint: 'Merge this into ~/.gemini/settings.json, then restart Gemini CLI.', write: mcpServers },
  antigravity: { hint: 'Merge this into ~/.gemini/config/mcp_config.json, then restart Antigravity.', write: mcpServers },
  json: { hint: "Merge this into your app's MCP settings; most apps read this mcpServers format.", write: mcpServers },
};

export const APPS = Object.keys(FORMATS);

function format(app) {
  const found = FORMATS[app];
  if (!found) { throw new Error(`unknown app "${app}"; use one of: ${APPS.join(', ')}`); }
  return found;
}

export const configHint = (app) => format(app).hint;

// `node`: the absolute path of the node executable; `root`: this repository
export function mcpConfig(app, { bundle, root, node, platform = process.platform }) {
  const { write } = format(app);
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const servers = Object.entries(bundle.mcpServers).map(([name, { script, args }]) =>
    [name, { command: node, args: [paths.join(root, ...script.split('/')), ...args] }]);
  return write(servers, platform);
}
