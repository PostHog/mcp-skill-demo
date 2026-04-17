import PixelGrid from '@/components/PixelGrid';

export default function Page() {
  return (
    <main>
      <h1>MCP Pixel Grid</h1>
      <p className="lede">
        A 128×128 grid of black/white pixels. Click to toggle.
      </p>

      <PixelGrid />

      <h2>The idea</h2>
      <p>
        MCP isn&apos;t a separate subsystem. It&apos;s another caller,
        alongside the browser click handler and a plain HTTP API. All
        three talk to the same <code>lib/grid.ts</code> module.
      </p>

      <h2>1 — UI click</h2>
      <p>
        <code>components/PixelGrid.tsx</code> POSTs <code>{'{x, y}'}</code> to{' '}
        <code>/api/toggle</code>. An SSE stream paints the result.
      </p>

      <h2>2 — HTTP API</h2>
      <pre>{`curl -X POST http://localhost:3000/api/set-matrix \\
  -H 'content-type: application/json' \\
  -d '{"pixels":[[10,10,1],[11,10,1],[12,10,1]]}'`}</pre>

      <h2>3 — MCP tool</h2>
      <p>
        The endpoint at <code>/api/mcp</code> speaks JSON-RPC 2.0 and
        exposes <code>set_pixels</code> and <code>get_grid</code>. Any
        MCP client (Claude Desktop, Inspector, a custom agent) can call
        them, and the calls end up in the same state module.
      </p>
      <pre>{`# List tools
curl -X POST http://localhost:3000/api/mcp \\
  -H 'content-type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Call one
curl -X POST http://localhost:3000/api/mcp \\
  -H 'content-type: application/json' \\
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call",
       "params":{"name":"set_pixels",
                 "arguments":{"pixels":[{"x":64,"y":64,"v":1}]}}}'`}</pre>

      <h2>Read the source</h2>
      <ul>
        <li><code>lib/grid.ts</code> — shared state + pub/sub</li>
        <li><code>components/PixelGrid.tsx</code> — canvas + click → toggle</li>
        <li><code>app/api/toggle/route.ts</code> — UI → state</li>
        <li><code>app/api/set-matrix/route.ts</code> — HTTP → state</li>
        <li><code>app/api/mcp/route.ts</code> — MCP → state (hand-rolled JSON-RPC)</li>
        <li><code>app/api/stream/route.ts</code> — state → browser (SSE)</li>
        <li><code>app/api/grid/route.ts</code> — initial snapshot</li>
      </ul>
    </main>
  );
}
