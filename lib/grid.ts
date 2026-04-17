// Single source of truth for the pixel grid.
// Every interface — UI click, HTTP API, MCP tool — converges here.
//
// Caveat: module-scope state lives in one Node process. This is fine
// for `next dev` / `next start`. For a serverless deployment you'd
// swap this module for Redis / Durable Objects / a DB.

export const WIDTH = 128;
export const HEIGHT = 128;

export type Pixel = { x: number; y: number; v: 0 | 1 };

const grid = new Uint8Array(WIDTH * HEIGHT); // 0 = white, 1 = black
const listeners = new Set<(diff: Pixel[]) => void>();

const idx = (x: number, y: number) => y * WIDTH + x;
const inBounds = (x: number, y: number) =>
  Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT;

export function snapshot(): Uint8Array {
  return grid.slice();
}

export function toggle(x: number, y: number): Pixel | null {
  if (!inBounds(x, y)) return null;
  const i = idx(x, y);
  const v: 0 | 1 = grid[i] ? 0 : 1;
  grid[i] = v;
  const p: Pixel = { x, y, v };
  emit([p]);
  return p;
}

export function setPixels(pixels: { x: number; y: number; v: unknown }[]): Pixel[] {
  const applied: Pixel[] = [];
  for (const p of pixels) {
    if (!inBounds(p.x, p.y)) continue;
    const v: 0 | 1 = p.v ? 1 : 0;
    grid[idx(p.x, p.y)] = v;
    applied.push({ x: p.x, y: p.y, v });
  }
  if (applied.length) emit(applied);
  return applied;
}

export function subscribe(fn: (diff: Pixel[]) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function emit(diff: Pixel[]) {
  for (const fn of listeners) fn(diff);
}
