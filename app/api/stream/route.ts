import { subscribe } from '@/lib/grid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Server-Sent Events: one event per batched diff. The UI repaints
// from these — so a pixel set via curl, via MCP, or via clicking
// all show up the same way, with no extra plumbing.
export async function GET() {
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const write = (chunk: string) => controller.enqueue(enc.encode(chunk));
      const send = (event: string, data: unknown) =>
        write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

      const unsub = subscribe((diff) => send('diff', diff));
      const hb = setInterval(() => write(`: ping\n\n`), 15000);

      cleanup = () => {
        unsub();
        clearInterval(hb);
      };
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  });
}
