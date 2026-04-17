import { snapshot } from '@/lib/grid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Raw bytes: row-major, 0=white, 1=black. 128*128 = 16,384 bytes.
export async function GET() {
  const buf = snapshot();
  return new Response(buf.buffer as ArrayBuffer, {
    headers: { 'content-type': 'application/octet-stream' },
  });
}
