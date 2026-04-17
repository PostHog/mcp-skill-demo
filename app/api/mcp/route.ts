import { snapshot, setPixels, WIDTH, HEIGHT } from '@/lib/grid';

export const runtime = 'nodejs';

// A minimal Model Context Protocol endpoint, hand-rolled to stay
// legible. MCP over HTTP is just JSON-RPC 2.0 with a small set of
// methods and a schema convention for tools. No SDK needed to show
// the shape of it.
//
// Supported methods:
//   initialize                 — handshake
//   notifications/initialized  — client ack (no response)
//   tools/list                 — advertise tools
//   tools/call                 — invoke one

const SERVER_INFO = { name: 'mcp-pixel-grid', version: '0.1.0' };
const PROTOCOL_VERSION = '2024-11-05';

const TOOLS = [
  {
    name: 'get_grid',
    description:
      'Return the 128×128 grid as a base64-encoded byte array (row-major, 0=white, 1=black).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'set_pixels',
    description:
      'Set a batch of pixels. Each pixel is {x, y, v} with v ∈ {0, 1}.',
    inputSchema: {
      type: 'object',
      properties: {
        pixels: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              x: { type: 'integer', minimum: 0, maximum: WIDTH - 1 },
              y: { type: 'integer', minimum: 0, maximum: HEIGHT - 1 },
              v: { type: 'integer', enum: [0, 1] },
            },
            required: ['x', 'y', 'v'],
          },
        },
      },
      required: ['pixels'],
      additionalProperties: false,
    },
  },
];

export async function POST(req: Request) {
  const msg = await req.json();
  const { id, method, params } = msg ?? {};

  const ok = (result: unknown) => Response.json({ jsonrpc: '2.0', id, result });
  const fail = (code: number, message: string) =>
    Response.json({ jsonrpc: '2.0', id, error: { code, message } });

  switch (method) {
    case 'initialize':
      return ok({
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });

    case 'notifications/initialized':
      return new Response(null, { status: 204 });

    case 'tools/list':
      return ok({ tools: TOOLS });

    case 'tools/call': {
      const { name, arguments: args } = params ?? {};

      if (name === 'get_grid') {
        const b64 = Buffer.from(snapshot()).toString('base64');
        return ok({
          content: [
            { type: 'text', text: `width=${WIDTH} height=${HEIGHT}` },
            { type: 'text', text: b64 },
          ],
        });
      }

      if (name === 'set_pixels') {
        const pixels = (args?.pixels ?? []) as { x: number; y: number; v: unknown }[];
        const applied = setPixels(pixels);
        return ok({
          content: [{ type: 'text', text: `applied ${applied.length} pixel(s)` }],
        });
      }

      return fail(-32601, `unknown tool: ${name}`);
    }

    default:
      return fail(-32601, `method not found: ${method}`);
  }
}
