import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { HEIGHT, ROOM_NAME, WIDTH, type Pixel } from "./grid-room";

// The MCP interface. Each MCP session runs in its own GridMCP DO
// instance (managed by McpAgent), but all of them proxy mutations to
// the singleton GridRoom — so the MCP tool is literally a caller of
// the same RPC that the HTTP route uses.

export class GridMCP extends McpAgent<Env> {
  server = new McpServer({
    name: "mcp-pixel-grid",
    version: "0.1.0",
  });

  async init(): Promise<void> {
    this.server.registerTool(
      "get_grid",
      {
        description:
          "Return the 128×128 grid as a base64-encoded byte array (row-major, 0=white, 1=black).",
        inputSchema: {},
      },
      async () => {
        const bytes = await this.room().snapshot();
        return {
          content: [
            { type: "text", text: `width=${WIDTH} height=${HEIGHT}` },
            { type: "text", text: toBase64(bytes) },
          ],
        };
      },
    );

    this.server.registerTool(
      "set_pixels",
      {
        description: "Set a batch of pixels. v=0 is white, v=1 is black.",
        inputSchema: {
          pixels: z
            .array(
              z.object({
                x: z.number().int().min(0).max(WIDTH - 1),
                y: z.number().int().min(0).max(HEIGHT - 1),
                v: z.union([z.literal(0), z.literal(1)]),
              }),
            )
            .max(WIDTH * HEIGHT),
        },
      },
      async ({ pixels }) => {
        const applied = await this.room().setPixels(pixels as Pixel[]);
        return {
          content: [{ type: "text", text: `applied ${applied} pixel(s)` }],
        };
      },
    );
  }

  // A stub to the singleton GridRoom. Not "the MCP server's state" —
  // the MCP server is stateless here; state lives in the Room.
  private room(): DurableObjectStub<import("./grid-room").GridRoom> {
    const id = this.env.ROOM.idFromName(ROOM_NAME);
    return this.env.ROOM.get(id) as DurableObjectStub<
      import("./grid-room").GridRoom
    >;
  }
}

function toBase64(bytes: Uint8Array): string {
  // btoa needs a binary string; chunk to avoid large spread.
  let s = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + CHUNK) as unknown as number[],
    );
  }
  return btoa(s);
}
