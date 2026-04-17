import { toggle } from '@/lib/grid';

export const runtime = 'nodejs';

// Flip a single pixel. Called by the UI on click.
export async function POST(req: Request) {
  const { x, y } = await req.json();
  const p = toggle(x, y);
  if (!p) return Response.json({ error: 'out of bounds' }, { status: 400 });
  return Response.json(p);
}
