import { GridMCP } from "./grid-mcp";
import { GridRoom, ROOM_NAME } from "./grid-room";

// Re-export the DO classes so the Workers runtime can find them.
export { GridMCP, GridRoom };

// The router. Three interfaces, one Worker.
//
//   /mcp         → GridMCP  (per-session DO, official MCP SDK over
//                             streamable HTTP, handled by agents)
//   /api/*, /ws  → GridRoom (singleton DO, owns the pixel state)
//   everything else → static HTML from ./public

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/mcp" || url.pathname.startsWith("/mcp/")) {
      return GridMCP.serve("/mcp", { binding: "MCP" }).fetch(req, env, ctx);
    }

    if (url.pathname.startsWith("/api/") || url.pathname === "/ws") {
      const id = env.ROOM.idFromName(ROOM_NAME);
      return env.ROOM.get(id).fetch(req);
    }

    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
