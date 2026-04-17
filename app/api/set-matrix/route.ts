import { setPixels } from '@/lib/grid';

export const runtime = 'nodejs';

// Batch set. Accepts either tuples [[x, y, v], ...] or objects [{x, y, v}, ...].
export async function POST(req: Request) {
  const { pixels } = await req.json();
  const list = (pixels as unknown[]).map((p) =>
    Array.isArray(p)
      ? { x: p[0] as number, y: p[1] as number, v: p[2] }
      : (p as { x: number; y: number; v: unknown }),
  );
  const applied = setPixels(list);
  return Response.json({ applied: applied.length });
}
