import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { HEIGHT, ROOM_NAME, SIZE, WIDTH, WRITE_SKIP } from "./grid-room";

const GRID_URI = "grid://current";

// The MCP interface. Each MCP session runs in its own GridMCP DO
// instance (managed by McpAgent), but all of them proxy mutations to
// the singleton GridRoom — so an MCP tool is literally a caller of
// the same RPC that the HTTP route uses.

export class GridMCP extends McpAgent<Env> {
  server = new McpServer({
    name: "mcp-pixel-grid",
    version: "0.2.0",
  });

  async init(): Promise<void> {
    this.server.registerResource(
      "grid",
      GRID_URI,
      {
        title: "Pixel grid",
        description:
          `The current ${WIDTH}×${HEIGHT} grid as ${HEIGHT} lines of ${WIDTH} ` +
          `characters each, separated by '\\n'. '0' = white, '1' = black. ` +
          `The format matches the 'bits' argument of the write tool, so a ` +
          `slice of this resource can be passed straight back in.`,
        mimeType: "text/plain",
      },
      async (uri) => {
        const bytes = await this.room().snapshot();
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain",
              text: bytesToGridText(bytes),
            },
          ],
        };
      },
    );

    this.server.registerTool(
      "clear",
      {
        description: "Clear the grid (set every pixel to white).",
        inputSchema: {},
      },
      async () => {
        const changed = await this.room().clear();
        return {
          content: [{ type: "text", text: `cleared ${changed} pixel(s)` }],
        };
      },
    );

    this.server.registerTool(
      "write",
      {
        description:
          `Write a run of pixels starting at a linear address. ` +
          `The grid is row-major: address = y * ${WIDTH} + x, ranging 0..${SIZE - 1}. ` +
          `The 'bits' string has one character per cell: ` +
          `'1' = black, '0' = white, '${WRITE_SKIP}' = leave unchanged. ` +
          `Writes wrap across rows. ` +
          `Example: offset=0, bits="11111111" blackens pixels (0,0)..(7,0).`,
        inputSchema: {
          offset: z.number().int().min(0).max(SIZE),
          bits: z
            .string()
            .regex(
              new RegExp(`^[01\\${WRITE_SKIP}]*$`),
              `bits must contain only '0', '1', or '${WRITE_SKIP}'`,
            ),
        },
      },
      async ({ offset, bits }) => {
        const changed = await this.room().writeBits(offset, bits);
        return {
          content: [{ type: "text", text: `wrote ${changed} pixel(s)` }],
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

// Render a row-major byte grid as HEIGHT lines of WIDTH characters,
// where each character is '0' (white) or '1' (black).
function bytesToGridText(bytes: Uint8Array): string {
  const rows: string[] = [];
  for (let y = 0; y < HEIGHT; y++) {
    let row = "";
    for (let x = 0; x < WIDTH; x++) {
      row += bytes[y * WIDTH + x] ? "1" : "0";
    }
    rows.push(row);
  }
  return rows.join("\n");
}
