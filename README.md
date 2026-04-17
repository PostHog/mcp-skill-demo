# MCP Pixel Grid

A demo showing how to build an MCP-enabled web application on Cloudflare Workers. A 32x32 pixel grid lives inside a Durable Object, and three interfaces converge on the same shared state:

1. **Browser UI** — click or drag to toggle pixels, with live updates over WebSocket
2. **HTTP API** — curl-friendly endpoints for reading and writing pixels
3. **MCP tools** — the official `@modelcontextprotocol/sdk` via Cloudflare's `McpAgent`, so any MCP client (Claude Code, Claude Desktop, MCP Inspector) can read and draw on the grid

The point: MCP isn't a separate subsystem. It's one caller among many, hitting the same Durable Object RPC that the browser and HTTP API use.

## Running locally

```bash
npm install
npm run dev
```

This starts `wrangler dev` on `http://localhost:8787`. Open it in a browser to see the grid, then connect an MCP client to `/mcp`.

### Connect Claude Code

```bash
claude mcp add --transport http pixel-grid http://localhost:8787/mcp
```

### Connect MCP Inspector

```bash
npx @modelcontextprotocol/inspector http://localhost:8787/mcp
```

## Deploying to Cloudflare

```bash
npm run deploy
```

This runs `wrangler deploy`, which publishes the Worker, creates the two Durable Object bindings (`GridRoom` and `GridMCP`), and serves the static assets from `public/`. You'll need a Cloudflare account with Workers Paid (required for Durable Objects).

After deploying, update your MCP client URL to point at the deployed hostname.

## MCP surface

### Resource: `grid://current`

The current grid as 32 lines of 32 characters (`0` = white, `1` = black). The format matches the `bits` argument of the `write` tool, so a row can be sliced and passed back directly.

### Tool: `clear`

Set every pixel to white. No parameters.

### Tool: `write`

Write a run of pixels starting at a linear address.

| Parameter | Type   | Description                                                    |
|-----------|--------|----------------------------------------------------------------|
| `offset`  | int    | Linear address 0–1023. Row-major: `y * 32 + x`                |
| `bits`    | string | One char per cell: `1` = black, `0` = white, `.` = skip/leave |

Writes wrap across rows. Example: `offset=0, bits="11111111"` blackens the first 8 pixels of the top row.

## Project structure

```
src/
  grid-room.ts    State-owning Durable Object (RPC + HTTP + WebSocket)
  grid-mcp.ts     McpAgent subclass — tools that proxy to the Room
  index.ts        Worker router
  stubs/ai.ts     Stub for an unused optional dep of the agents package
public/
  index.html      Browser UI (canvas + docs)
wrangler.jsonc    DO bindings, static assets, compatibility flags
```

## Agent Skill

The `.claude/skills/pixel-grid-draw/` directory contains an Agent Skill that compiles 2D drawing operations (rectangles, frames, bitmaps) into sequences of `write` tool calls. See its `SKILL.md` for usage.
