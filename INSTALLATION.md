# Installing `rave-agents`

`rave-agents` lets an AI agent work with [RAVE](https://rave.wiki). It
contains two MCP servers and three skills:

| Part | What the agent can do with it |
|---|---|
| `shidashi` MCP server | Find the RAVE dashboard on your computer, read and set module inputs, run module scripts |
| `threebrain` MCP server | Control threeBrain 3D brain viewers open in your browser: camera, colors, electrodes, screenshots |
| `rave` skill | Find (or, with your permission, start) the RAVE app, and know what to ask you before loading data |
| `search-papers` skill | Search PubMed, arXiv and bioRxiv |
| `build-module-mcp` skill | For RAVE developers: make a RAVE module usable by agents |

Each app below can install it in one of two ways:

- **Plugin**: the app downloads and updates `rave-agents` for you. Use this
  when your app supports it.
- **Manual**: you download this repository once and point the app's
  settings at it. This works in apps without plugins, for example the Chat
  mode of Claude Desktop.

## Contents

- [Requirements](#requirements)
- [Claude Code](#claude-code)
- [Claude Desktop](#claude-desktop)
- [Codex](#codex)
- [GitHub Copilot CLI](#github-copilot-cli)
- [VS Code and Positron](#vs-code-and-positron)
- [Cursor](#cursor)
- [Gemini CLI and Antigravity CLI](#gemini-cli-and-antigravity-cli)
- [Other agents](#other-agents)
- [Manual setup, step by step](#manual-setup-step-by-step)
- [Updating](#updating)
- [Troubleshooting](#troubleshooting)
- [Uninstalling](#uninstalling)

## Requirements

**Always: [Node.js](https://nodejs.org/) 18 or newer.** Both MCP servers
are Node.js programs. Check with `node --version` in a terminal.

R is needed only for some parts:

| To use | You also need |
|---|---|
| threeBrain 3D viewers (`threebrain` server) | Nothing else. A threeBrain viewer open in your browser; R is not needed |
| The RAVE dashboard (`shidashi` server, `rave` skill) | R with RAVE installed (`ravemanager::install()`). The `rave` skill's helper script uses the `ravedash` and `jsonlite` packages, which come with RAVE |
| Paper search (`search-papers` skill) | R with the `httr2` package: `install.packages("httr2")` |
| Module development (`build-module-mcp` skill) | R, and a clone of [`rave-pipelines`](https://github.com/rave-ieeg/rave-pipelines) |

## Claude Code

In the terminal, in VS Code or in JetBrains.

**Plugin** (recommended). In a Claude Code session, run:

```
/plugin marketplace add rave-ieeg/agents
/plugin install rave-agents@rave-ieeg
```

Then run `/reload-plugins`, or start a new session. Run `/mcp` to check:
it lists `plugin:rave-agents:shidashi` and `plugin:rave-agents:threebrain`.

The same commands work from a shell, outside a session:
`claude plugin marketplace add rave-ieeg/agents` and
`claude plugin install rave-agents@rave-ieeg`.

> If you installed `shidashi@shidashi` earlier (from `dipterix/shidashi`),
> uninstall it: `/plugin uninstall shidashi@shidashi`. `rave-agents`
> contains it, and two copies show the agent two `shidashi` servers and two
> `rave` skills.

**Manual.** Follow [Manual setup](#manual-setup-step-by-step) with the app
name `claude-code`. It prints two `claude mcp add` commands to run in a
terminal. For the skills, copy the folders in `skills/` into
`~/.claude/skills/`.

## Claude Desktop

**Chat mode: manual (recommended).** Chat mode does not start a plugin's
MCP servers, but it does start the ones in Claude Desktop's settings file:

1. Follow [Manual setup](#manual-setup-step-by-step) with the app name
   `claude-desktop`.
2. In Claude Desktop, open **Settings > Developer > Edit Config**. This
   opens `claude_desktop_config.json`:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
3. Add the two entries under `"mcpServers"`. If the file already has an
   `"mcpServers"` section, add them to it rather than adding a second one.
4. Quit Claude Desktop completely and open it again.

Skills are optional in Chat mode. To add one, zip its folder (for example
`skills/rave`) and upload it under **Customize > Skills**; this needs code
execution turned on. Uploaded skills run in Anthropic's cloud sandbox, not on
your computer. So in Chat mode the `rave` skill cannot list the RAVE sessions
on your computer. The MCP servers still run locally, and the agent can still
reach RAVE through them.

**Cowork and Code tabs: plugin (not tested yet).** Open **Customize >
Plugins > Add > Add marketplace**, enter `rave-ieeg/agents`, and install
`rave-agents`. If the agent then cannot find RAVE or a threeBrain viewer,
use Chat mode with the manual setup above.

## Codex

Codex CLI, the Codex IDE extension and Codex in the ChatGPT desktop app
share one settings file, `~/.codex/config.toml`, so set it up once.

**Plugin.** In a terminal:

```
codex plugin marketplace add rave-ieeg/agents
codex plugin add rave-agents@rave-ieeg
```

**Manual.** Follow [Manual setup](#manual-setup-step-by-step) with the app
name `codex`, and add the printed lines to `~/.codex/config.toml`. For the
skills, copy the folders in `skills/` into `~/.agents/skills/`.

> ChatGPT itself (chat on the web or in the desktop app) cannot use these
> servers. It connects only to MCP servers on the internet, and these run on
> your computer. Use Codex instead.

## GitHub Copilot CLI

**Plugin.** In a terminal:

```
copilot plugin marketplace add rave-ieeg/agents
copilot plugin install rave-agents@rave-ieeg
```

**Manual.** Follow [Manual setup](#manual-setup-step-by-step) with the app
name `copilot`, and merge the output into `~/.copilot/mcp-config.json`. For
the skills, copy the folders in `skills/` into `~/.copilot/skills/`.

## VS Code and Positron

**Plugin (VS Code with GitHub Copilot; not tested yet).** Turn on the
setting `chat.plugins.enabled`. Then run **Chat: Install Plugin From
Source** from the Command Palette and enter
`https://github.com/rave-ieeg/agents`.

**Manual.** Follow [Manual setup](#manual-setup-step-by-step) with the app
name `vscode`. Run **MCP: Open User Configuration** and merge the output
into that `mcp.json`. Positron reads the same format; inside one project you
can use the project's `.vscode/mcp.json` instead.

## Cursor

**Plugin (not tested yet).** Copy this repository's folder, not a link to
it, to `~/.cursor/plugins/local/rave-agents`, then run **Developer: Reload
Window**.

**Manual.** Follow [Manual setup](#manual-setup-step-by-step) with the app
name `cursor`, and merge the output into `~/.cursor/mcp.json`. For the
skills, copy the folders in `skills/` into `~/.cursor/skills/`.

## Gemini CLI and Antigravity CLI

**Gemini CLI plugin.** Run:

```
gemini extensions install https://github.com/rave-ieeg/agents
```

When it asks whether to trust the folder, answer `y`. Check with
`gemini mcp list`.

**Antigravity CLI plugin (not tested yet).** Run
`agy plugin install https://github.com/rave-ieeg/agents`.

**Manual.** Follow [Manual setup](#manual-setup-step-by-step) with the app
name `gemini` (merge the output into `~/.gemini/settings.json`) or
`antigravity` (merge it into `~/.gemini/config/mcp_config.json`). For Gemini
CLI skills, copy the folders in `skills/` into `~/.gemini/skills/`.

## Other agents

**Skills only.** [`skills`](https://github.com/vercel-labs/skills) installs
the three skills into many agents (Cline, OpenCode, Zed, Warp and others).
It asks which agents to install them for:

```
npx skills add rave-ieeg/agents
```

**MCP servers.** Most apps that support MCP read the common `mcpServers`
format. Follow [Manual setup](#manual-setup-step-by-step) with the app name
`json`.

## Manual setup, step by step

1. **Download this repository**, once, to a folder you will keep. The
   settings you add point into this folder. Either run
   `git clone https://github.com/rave-ieeg/agents.git`, or use GitHub's
   **Code > Download ZIP** and unzip it.
2. **Print the settings for your app.** In a terminal, go into that folder
   and run:

   ```
   node tools/mcp-config.mjs claude-desktop
   ```

   Replace `claude-desktop` with your app: `claude-code`, `claude-desktop`,
   `codex`, `copilot`, `vscode`, `cursor`, `gemini`, `antigravity`, or
   `json` for anything else. It prints the settings with the full paths of
   your copy and of `node` already filled in, and says where they go.
3. **Add them** to the file it names, then restart the app.
4. **Skills** (optional): copy the folders in `skills/` into your app's
   skills folder, as listed in the app's section above.

The settings look like this, with your own paths:

```json
{
  "mcpServers": {
    "shidashi": {
      "command": "/usr/local/bin/node",
      "args": ["/Users/you/rave-agents/servers/shidashi/shidashi-proxy.mjs"]
    },
    "threebrain": {
      "command": "/usr/local/bin/node",
      "args": ["/Users/you/rave-agents/servers/threebrain/threebrain-hub.mjs", "mcp"]
    }
  }
}
```

## Updating

- **Claude Code:** in a terminal, run
  `claude plugin marketplace update rave-ieeg`, then
  `claude plugin update rave-agents@rave-ieeg`, then restart Claude Code.
  The first command only refreshes the list of plugins; the second installs
  the new version. To update automatically, open `/plugin`, go to
  **Marketplaces**, select `rave-ieeg` and choose **Enable auto-update**.
- **Codex:** `codex plugin marketplace upgrade rave-ieeg`. If
  `codex plugin list` still shows the old version, run
  `codex plugin add rave-agents@rave-ieeg` again.
- **Copilot CLI:** `copilot plugin update rave-agents@rave-ieeg`
- **Gemini CLI:** `gemini extensions update rave-agents`
- **Manual setup:** `git pull` in your copy, or download the ZIP again into
  the same folder. Then restart the app.

## Troubleshooting

**The servers do not start in a desktop app, or the app says it cannot
find `node`.** Apps started from the Dock, Finder or Start menu often do
not see the `node` your terminal uses. Use
[Manual setup](#manual-setup-step-by-step): `tools/mcp-config.mjs` writes
the full path of `node`.

**The agent sees two `shidashi` servers or two `rave` skills.** Something
is installed twice: `rave-agents` in two ways (for example as a plugin and
by manual setup, or in both Claude Desktop and Claude Code), or the older
`shidashi@shidashi` plugin next to it (see [Claude Code](#claude-code)).
Keep one.

**The agent cannot find RAVE.** Start RAVE in R with `rave::start_rave()`,
or let the agent start it; it asks you first. If you moved the shidashi
cache folder with `options(shidashi.cache_dir = ...)`, set the environment
variable `SHIDASHI_CACHE_DIR` to the same folder for the app.

**A threeBrain viewer does not connect.** Viewers never connect by
themselves. The agent gives you a passkey. Paste it into **Passkey** in the
viewer's control panel (the **Default** folder at the top) and click
**Connect**. Screenshots need the viewer's browser tab to be visible.

**Windows.** Use `tools/mcp-config.mjs` for the settings: it writes the
backslashes in paths the way JSON and TOML need them.

## Uninstalling

- **Claude Code:** `/plugin uninstall rave-agents@rave-ieeg`
- **Codex:** `codex plugin remove rave-agents@rave-ieeg`
- **Copilot CLI:** `copilot plugin uninstall rave-agents@rave-ieeg`
- **Gemini CLI:** `gemini extensions uninstall rave-agents`
- **Manual setup:** remove the `shidashi` and `threebrain` entries from the
  app's settings, and the copied skill folders.
