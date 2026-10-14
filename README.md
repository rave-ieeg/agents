# RAVE agents

Plugins that let AI agents work with [RAVE](https://rave.wiki), the
Reproducible Analysis and Visualization of iEEG platform. One plugin,
`rave-agents`, gives Claude Code, Codex, GitHub Copilot, Cursor, Gemini and
other agents what they need to operate RAVE:

| Part | What the agent can do with it | Comes from |
|---|---|---|
| `shidashi` MCP server, `rave` skill | Find the RAVE dashboard, read and set module inputs, run module scripts | [dipterix/shidashi](https://github.com/dipterix/shidashi) |
| `threebrain` MCP server | Control threeBrain 3D brain viewers in your browser | [dipterix/threeBrain](https://github.com/dipterix/threeBrain) |
| `search-papers`, `build-module-mcp` skills | Search PubMed, arXiv and bioRxiv; make RAVE modules usable by agents | [rave-ieeg/rave-pipelines](https://github.com/rave-ieeg/rave-pipelines) |

## Install

You need [Node.js](https://nodejs.org/) 18 or newer. R is needed only for
the RAVE dashboard and the R-based skills; threeBrain viewers work without
it.

In Claude Code:

```
/plugin marketplace add rave-ieeg/agents
/plugin install rave-agents@rave-ieeg
```

For other apps, for Claude Desktop's Chat mode, and for setting it up by
hand, see **[INSTALLATION.md](INSTALLATION.md)**.

Then ask the agent, for example: "Which RAVE modules are open?" or "Make
the 3D viewer's background black and take a screenshot."

## Privacy

Everything runs on your computer. The plugin collects nothing and sends
nothing to its authors. The MCP servers talk only to the RAVE app and the
threeBrain viewers on your computer, or to a RAVE address you give the
agent. The `shidashi` server keeps a log of its calls on your computer (see
the [shidashi plugin README](https://github.com/dipterix/shidashi/tree/main/inst/mcp-proxy)).

What the agent reads through them goes to your AI provider, like the rest
of the conversation. That can include project and subject codes, analysis
results and viewer screenshots, which may show patient imaging. Follow
your institution's rules before connecting an agent to patient data.

## For maintainers

This repository is the plugin: its root holds a manifest for each agent
host. `skills/` and `servers/` are copies of files from the upstream
repositories above. Do not edit them here; change them upstream, then sync.

| Command | What it does |
|---|---|
| `node tools/sync.mjs` | Copy the latest upstream files, rewrite every manifest from `tools/bundle.json`, record the upstream commits in `tools/sources.lock.json`, and bump the patch version when anything changed |
| `node tools/sync.mjs --local` | Copy from your clones next to this repository (`localPath` in `tools/bundle.json`), uncommitted work included, to try it out. Don't commit the result; run `node tools/sync.mjs` afterwards |
| `node tools/sync.mjs --check` | Check that the files match the lock and `tools/bundle.json` |
| `node --test "tools/test/*.test.mjs"` | Run the tests, including starting each MCP server the way each host would |
| `node tools/mcp-config.mjs <app>` | Print an app's MCP settings for a manual install (see INSTALLATION.md) |

To add a file, skill or server, edit `tools/bundle.json` and run
`node tools/sync.mjs`.

**Automatic updates.** `.github/workflows/sync.yml` syncs, tests and
publishes to `main`:

- once a day;
- from its "Run workflow" button;
- right away when an upstream repository asks.

For that last trigger, each upstream repository carries
`.github/workflows/notify-rave-agents.yml` (template:
`tools/notify-rave-agents.yml`). It needs the repository secret
`RAVE_AGENTS_DISPATCH_TOKEN`: a fine-grained personal access token limited
to `rave-ieeg/agents`, with "Actions: Read and write". It can start the sync
workflow but cannot push code.

## License

GPL-3.0 (see `LICENSE`). The copied components keep their own licenses,
stored next to them: shidashi and rave-pipelines are MIT, and the
threeBrain hub is MPL-2.0.
