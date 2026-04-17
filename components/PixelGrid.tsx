'use client';

import { useEffect, useRef } from 'react';

const W = 128;
const H = 128;
const SCALE = 4; // CSS pixels per cell → 512×512 on screen

type Pixel = { x: number; y: number; v: 0 | 1 };

export default function PixelGrid() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(W, H);

    // 1. Hydrate from server snapshot
    fetch('/api/grid')
      .then((r) => r.arrayBuffer())
      .then((buf) => paintAll(ctx, img, new Uint8Array(buf)));

    // 2. Subscribe to live diffs (UI, HTTP, or MCP — all flow through here)
    const es = new EventSource('/api/stream');
    es.addEventListener('diff', (e) => {
      const diff: Pixel[] = JSON.parse((e as MessageEvent).data);
      paintDiff(ctx, img, diff);
    });

    return () => es.close();
  }, []);

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * W);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * H);
    // No optimistic update: the SSE diff paints it. Same code path as
    // an MCP tool call — the browser is just another client.
    fetch('/api/toggle', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ x, y }),
    });
  };

  return (
    <div className="grid-wrap">
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        onClick={onClick}
        style={{ width: W * SCALE, height: H * SCALE }}
      />
    </div>
  );
}

function paintAll(ctx: CanvasRenderingContext2D, img: ImageData, grid: Uint8Array) {
  for (let i = 0; i < grid.length; i++) {
    const c = grid[i] ? 0 : 255;
    img.data[i * 4] = c;
    img.data[i * 4 + 1] = c;
    img.data[i * 4 + 2] = c;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function paintDiff(ctx: CanvasRenderingContext2D, img: ImageData, diff: Pixel[]) {
  for (const { x, y, v } of diff) {
    const i = (y * W + x) * 4;
    const c = v ? 0 : 255;
    img.data[i] = c;
    img.data[i + 1] = c;
    img.data[i + 2] = c;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}
