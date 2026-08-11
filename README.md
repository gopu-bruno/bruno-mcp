### Bruno MCP - Model Context Protocol server for Bruno

Bruno MCP is an [MCP](https://modelcontextprotocol.io) server that lets AI assistants (Claude, Cursor, and any other MCP-compatible client) work with your [Bruno](https://github.com/usebruno/bruno) API collections.

It exposes your requests, folders, and environments as MCP tools so an agent can discover, inspect, and run them, while your collections stay on your filesystem, right where Bruno keeps them.

> Bruno is an open source, offline-first API client. Collections live as plain text files in a folder, versioned with Git. Bruno MCP brings that same philosophy to AI workflows, your data never leaves your machine.

## Tools

| Tool | Purpose |
|---|---|
| `list_collections` | List registered collections with their environments. Read-only. |
| `list_requests` | List requests in a collection (relative path + method + URL); optional `search` and `method` filters. Read-only. |
| `execute_request` | Execute one request via `bru run`; returns status, response body, assertions, and test results. All request/response headers are omitted and URL query values redacted. Takes `collectionId`, `requestPath`, optional `environment` and `variables` overrides. |

## Setup

Build first. Clients spawn the compiled entry (`dist/index.js`) directly, so it must exist before you configure a client; rebuild after source changes or use `npm run watch`:

```bash
npm install
npm run build
```

Get the absolute path to the compiled entry and use it wherever a client config asks for the server command:

```bash
echo "$(pwd)/dist/index.js"
```

### Claude Code

```bash
claude mcp add bruno -- node /abs/path/to/dist/index.js
# optional: pin a collection
claude mcp add bruno -- node /abs/path/to/dist/index.js --collection /path/to/collection
```

Verify with `claude mcp list`, then open a new session.

### Cursor / Claude Desktop

Add to `~/.cursor/mcp.json` (Cursor) or `~/Library/Application Support/Claude/claude_desktop_config.json` (Claude Desktop, macOS):

```json
{
  "mcpServers": {
    "bruno": {
      "command": "node",
      "args": ["/abs/path/to/dist/index.js", "--collection", "/path/to/collection"]
    }
  }
}
```

Reload Cursor (or toggle the server in Settings > MCP). Fully quit Claude Desktop (⌘Q) and reopen. Drop the `--collection` args to rely on auto-discovery.

### MCP Inspector

```bash
npx @modelcontextprotocol/inspector node /abs/path/to/dist/index.js
```

## Collection discovery

At startup the server resolves which collections to expose. Sources, first non-empty wins:

1. **Explicit flags**: `--collection` / `--workspace` (both repeatable; a workspace expands to its member collections).
2. **CWD walk-up**: looks for `bruno.json` / `opencollection.yml` / `workspace.yml` walking up from the current directory.
3. **Bruno desktop preferences** *(on by default; `--no-auto-discovery` to disable)*: `lastOpenedWorkspaces`, `lastOpenedCollections`, and the default workspace from `preferences.json`:
   - macOS: `~/Library/Application Support/bruno/preferences.json`
   - Windows: `%APPDATA%/bruno/preferences.json`
   - Linux: `~/.config/bruno/preferences.json`

## Options

Options are passed as CLI flags when the client spawns the server (see the setup snippets above).

```
Usage: bruno-mcp [--collection <path>] [--workspace <path>]
                 [--cwd-path <path>] [--no-cwd-discovery] [--no-auto-discovery] [--verbose]
```

| Flag | Description |
|---|---|
| `--collection <path>`, `-c` | Bruno collection directory. Repeatable. |
| `--workspace <path>`, `-w` | Bruno workspace directory. Repeatable; expands to member collections. |
| `--cwd-path <path>` | Override the CWD used for walk-up discovery. |
| `--no-cwd-discovery` | Disable the CWD walk-up step. |
| `--no-auto-discovery` | Disable the Bruno desktop preferences fallback. |
| `--verbose` | Log debug info to stderr. |
| `--help`, `-h` | Show help. |

## Links

- [Bruno](https://github.com/usebruno/bruno)
- [Bruno docs](https://docs.usebruno.com)
- [Bruno CLI](https://docs.usebruno.com/bru-cli/overview)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [Website](https://www.usebruno.com) · [Discord](https://discord.com/invite/KgcZUncpjq) · [X](https://twitter.com/use_bruno)

## License

MIT
