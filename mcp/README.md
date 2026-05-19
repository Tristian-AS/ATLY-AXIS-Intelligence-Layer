# @atly/axis-mcp — Claude Code plugin for ATLY Axis

An MCP server that exposes the Axis backend as ~25 tools to any Claude Code
session. Tristian can be in *any* repo on his laptop and have Claude reach
into the studio's operating brain — status, memory, finance, campaigns,
content calendar — and read/write it.

## Architecture

```
Claude Code (any workspace)
        ↓ stdio · MCP protocol
@atly/axis-mcp  (this package)
        ↓ AxisClient · HTTPS
Axis backend (Vercel)
        ↓
Postgres + raw/wiki + Claude Opus runtime
```

The plugin identifies itself as `actor=plugin:claude-code` in Axis's audit
log, so CLI activity is cleanly distinguished from atlystudios.ai BFF calls
and from Tristian's native Axis UI.

## Install

### Option A — from this repo

```bash
git clone https://github.com/Tristian-AS/ATLY-AXIS-Intelligence-Layer
cd ATLY-AXIS-Intelligence-Layer/mcp
npm install         # builds dist/ via prepare script
```

### Option B — from GitHub (npm)

```bash
npm install -g github:Tristian-AS/ATLY-AXIS-Intelligence-Layer#main \
  --workspaces=false
# the npm subpath approach is fiddly; vendoring `mcp/` is often easier
```

## Configure Claude Code

In your Claude Code workspace, add a `.mcp.json` at the workspace root (or
edit your global `~/.claude/mcp.json`):

```json
{
  "mcpServers": {
    "axis": {
      "command": "node",
      "args": ["/absolute/path/to/ATLY-AXIS-Intelligence-Layer/mcp/dist/index.js"],
      "env": {
        "AXIS_URL": "https://axis.atlystudios.ai",
        "AXIS_API_TOKEN": "${AXIS_API_TOKEN}"
      }
    }
  }
}
```

Set the token in your shell profile so it interpolates:

```bash
export AXIS_API_TOKEN="..."  # the same token you set in Vercel
```

Restart Claude Code. Run `/mcp` (or check the MCP status indicator) — you
should see the `axis` server connected with ~25 tools.

## What you can ask Claude Code now

Once the plugin is connected, Claude in any workspace can:

- "What's happening at ATLY today?" → calls `axis_status`
- "Read the Rhøme wiki page." → calls `axis_memory_read` on `clients/rhome.md`
- "Draft an invoice for Loftwood — $8,500 deposit." → calls `axis_invoices_create`
- "Generate a campaign concept for Rhøme around tactile slow-luxury." → calls `axis_campaigns_generate_plan`
- "Log that I bought a Sony FX3 for $4,200 yesterday — equipment." → calls `axis_expenses_log`
- "What should I set aside for taxes this quarter?" → calls `axis_taxes_estimate`
- "Add a lesson: 'Approval cycles compress production windows.'" → calls `axis_memory_write` with scope=lesson

## Tools exposed

System: `axis_health`, `axis_status`

Clients: `axis_clients_list`, `axis_clients_create`, `axis_clients_get`

Projects: `axis_projects_list`, `axis_projects_create`

Campaigns: `axis_campaigns_list`, `axis_campaigns_generate_plan`

Content: `axis_content_calendar_list`, `axis_content_calendar_generate`

Finance: `axis_invoices_list`, `axis_invoices_create`, `axis_expenses_list`,
         `axis_expenses_log`, `axis_taxes_estimate`

Tasks: `axis_tasks_list`, `axis_tasks_create`, `axis_tasks_update`

Memory: `axis_memory_read`, `axis_memory_list`, `axis_memory_write`

Chat: `axis_chat` — escalate to Axis's own tool-use loop when you want
ATLY's voice and judgment, not just data.

Cinematic Growth Engine: `axis_cinematic_engine_dashboard`

## Security

- The MCP server is local-only (stdio transport). It does not open a port.
- The Axis token never leaves your machine — Claude Code reads it from the
  process environment.
- Audit log: every call lands in Axis with `actor=plugin:claude-code` plus
  the tool name and payload, so you can review what the CLI has touched.

## Troubleshooting

Plugin doesn't appear in Claude Code:
- Check `/mcp` output for errors.
- Look at the server's stderr: launch it once by hand with
  `AXIS_URL=... AXIS_API_TOKEN=... node mcp/dist/index.js` — it should print
  `[axis-mcp] connected.` then wait on stdin.

Plugin says "missing env":
- Your `.mcp.json` `env` block isn't resolving `${AXIS_API_TOKEN}`. Either
  paste the token literally there, or use a shell launcher script.

`axis_status` returns 401:
- Token mismatch with the Vercel deployment. Regenerate and update both.
