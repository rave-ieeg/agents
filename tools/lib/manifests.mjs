// Every agent host reads its own manifest. All of them are written from
// tools/bundle.json so they can't drift apart. Paths are relative to the
// repository root, which is also the plugin root.

const AGENT_PLUGINS = 'https://agent-plugins.org/schemas/1.0.0';

const servers = (bundle, toEntry) =>
  Object.fromEntries(Object.entries(bundle.mcpServers).map(([name, server]) => [name, toEntry(server)]));

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

export function generateManifests(bundle) {
  const { marketplace, plugin } = bundle;
  const about = {
    name: plugin.name,
    version: plugin.version,
    description: plugin.description,
    author: plugin.author,
    homepage: plugin.homepage,
    repository: plugin.repository,
    license: plugin.license,
    keywords: plugin.keywords,
  };

  return {
    // Claude Code; Codex and Copilot CLI read this marketplace too. No
    // version here: Claude Code takes it from plugin.json.
    '.claude-plugin/marketplace.json': {
      $schema: 'https://anthropic.com/claude-code/marketplace.schema.json',
      name: marketplace.name,
      description: marketplace.description,
      owner: marketplace.owner,
      plugins: [{
        name: plugin.name,
        source: './',
        description: plugin.description,
        category: plugin.category,
        homepage: plugin.homepage,
        keywords: plugin.keywords,
      }],
    },
    // MCP servers inline: Claude Code and Copilot CLI also read a root
    // .mcp.json as the MCP config of whoever works inside this repository
    '.claude-plugin/plugin.json': {
      ...about,
      displayName: plugin.displayName,
      mcpServers: servers(bundle, ({ script, args }) => ({
        command: 'node',
        args: [`\${CLAUDE_PLUGIN_ROOT}/${script}`, ...args],
      })),
    },

    // Agent Plugins 1.0 (Codex, Copilot CLI, Cursor). The servers run from
    // the plugin root (`cwd: "./"`) with plugin-relative script paths: no
    // root variable is expanded by all of these hosts.
    'plugin.json': {
      $schema: `${AGENT_PLUGINS}/plugin.schema.json`,
      ...about,
      extensions: {
        'com.openai': {
          interface: {
            displayName: plugin.displayName,
            shortDescription: plugin.description,
            developerName: plugin.author.name,
            category: capitalize(plugin.category),
            websiteURL: plugin.homepage,
          },
        },
      },
    },
    'mcp.json': {
      $schema: `${AGENT_PLUGINS}/mcp.schema.json`,
      mcpServers: servers(bundle, ({ script, args }) => ({
        type: 'stdio',
        command: 'node',
        args: [`./${script}`, ...args],
        cwd: './',
      })),
    },
    '.agents/plugins/marketplace.json': {
      name: marketplace.name,
      interface: { displayName: marketplace.displayName },
      plugins: [{
        name: plugin.name,
        source: { source: 'local', path: './' },
        policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
        category: capitalize(plugin.category),
      }],
    },

    // Gemini CLI (Antigravity CLI imports this format)
    'gemini-extension.json': {
      name: plugin.name,
      version: plugin.version,
      description: plugin.description,
      mcpServers: servers(bundle, ({ script, args }) => ({
        command: 'node',
        args: [`\${extensionPath}\${/}${script.split('/').join('${/}')}`, ...args],
        cwd: '${extensionPath}',
      })),
    },
  };
}

// The manifests as file contents, keyed by path
export function manifestFiles(bundle) {
  return new Map(Object.entries(generateManifests(bundle))
    .map(([path, json]) => [path, `${JSON.stringify(json, null, 2)}\n`]));
}
