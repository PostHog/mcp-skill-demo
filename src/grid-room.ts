import { DurableObject } from "cloudflare:workers";

// The single source of truth. Every interface — HTTP click, WebSocket,
// MCP tool — converges on the RPC methods below.
//
// This DO is addressed as a singleton via idFromName("room"). State
// lives in a Uint8Array, persisted to ctx.storage. Live updates fan
// out to every subscribed browser via hibernatable WebSockets.

export const WIDTH = 32;
export const HEIGHT = 32;
export const SIZE = WIDTH * HEIGHT;
export const ROOM_NAME = "room";

// Skip character for writeBits: leaves a cell untouched.
export const WRITE_SKIP = ".";

export type Pixel = { x: number; y: number; v: 0 | 1 };

const STORAGE_KEY = "grid";

export class GridRoom extends DurableObject<Env> {
  private grid: Uint8Array;
  private loaded: Promise<void>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.grid = new Uint8Array(WIDTH * HEIGHT);
    this.loaded = this.hydrate();
  }

  private async hydrate(): Promise<void> {
    const stored = await this.ctx.storage.get<ArrayBuffer>(STORAGE_KEY);
    // Drop persisted state of a different size (e.g. after a grid resize).
    if (stored && stored.byteLength === WIDTH * HEIGHT) {
      this.grid = new Uint8Array(stored);
    }
  }

  // ─── RPC: the contract every interface uses ──────────────────────

  async snapshot(): Promise<Uint8Array> {
    await this.loaded;
    return new Uint8Array(this.grid);
  }

  async toggle(x: number, y: number): Promise<Pixel | null> {
    await this.loaded;
    if (!inBounds(x, y)) return null;
    const i = y * WIDTH + x;
    const v: 0 | 1 = this.grid[i] ? 0 : 1;
    this.grid[i] = v;
    const p: Pixel = { x, y, v };
    await this.persist();
    this.broadcast([p]);
    return p;
  }

  async setPixels(pixels: Pixel[]): Promise<number> {
    await this.loaded;
    const applied: Pixel[] = [];
    for (const p of pixels) {
      if (!inBounds(p.x, p.y)) continue;
      const v: 0 | 1 = p.v ? 1 : 0;
      this.grid[p.y * WIDTH + p.x] = v;
      applied.push({ x: p.x, y: p.y, v });
    }
    if (applied.length) {
      await this.persist();
      this.broadcast(applied);
    }
    return applied.length;
  }

  async clear(): Promise<number> {
    await this.loaded;
    const diff: Pixel[] = [];
    for (let i = 0; i < this.grid.length; i++) {
      if (this.grid[i]) {
        diff.push({ x: i % WIDTH, y: Math.floor(i / WIDTH), v: 0 });
      }
    }
    if (!diff.length) return 0;
    this.grid.fill(0);
    await this.persist();
    this.broadcast(diff);
    return diff.length;
  }

  // Write a run of bits starting at a linear address. Characters:
  //   '1' → black, '0' → white, '.' (WRITE_SKIP) → leave cell unchanged.
  // Returns the count of cells that actually changed.
  async writeBits(offset: number, bits: string): Promise<number> {
    await this.loaded;
    if (!Number.isInteger(offset) || offset < 0 || offset > SIZE) {
      throw new Error(`invalid offset: ${offset} (must be 0..${SIZE})`);
    }
    if (offset + bits.length > SIZE) {
      throw new Error(
        `write of ${bits.length} bits at offset ${offset} exceeds grid size ${SIZE}`,
      );
    }
    const diff: Pixel[] = [];
    for (let i = 0; i < bits.length; i++) {
      const c = bits[i];
      if (c === WRITE_SKIP) continue;
      if (c !== "0" && c !== "1") {
        throw new Error(
          `invalid bit char at index ${i}: ${JSON.stringify(c)} ` +
            `(expected "0", "1", or "${WRITE_SKIP}")`,
        );
      }
      const v: 0 | 1 = c === "1" ? 1 : 0;
      const pos = offset + i;
      if (this.grid[pos] === v) continue;
      this.grid[pos] = v;
      diff.push({ x: pos % WIDTH, y: Math.floor(pos / WIDTH), v });
    }
    if (diff.length) {
      await this.persist();
      this.broadcast(diff);
    }
    return diff.length;
  }

  // ─── HTTP interface (browser click + curl) ───────────────────────

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/ws" && req.headers.get("upgrade") === "websocket") {
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server); // hibernation API
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === "/api/grid" && req.method === "GET") {
      const buf = await this.snapshot();
      return new Response(buf.buffer as ArrayBuffer, {
        headers: { "content-type": "application/octet-stream" },
      });
    }

    if (url.pathname === "/api/toggle" && req.method === "POST") {
      const { x, y } = (await req.json()) as { x: number; y: number };
      const p = await this.toggle(x, y);
      if (!p) return Response.json({ error: "out of bounds" }, { status: 400 });
      return Response.json(p);
    }

    if (url.pathname === "/api/set-matrix" && req.method === "POST") {
      const body = (await req.json()) as {
        pixels: Array<[number, number, number] | Pixel>;
      };
      const list: Pixel[] = body.pixels.map((p) =>
        Array.isArray(p)
          ? { x: p[0], y: p[1], v: (p[2] ? 1 : 0) as 0 | 1 }
          : p,
      );
      const applied = await this.setPixels(list);
      return Response.json({ applied });
    }

    if (url.pathname === "/api/clear" && req.method === "POST") {
      const cleared = await this.clear();
      return Response.json({ cleared });
    }

    return new Response("not found", { status: 404 });
  }

  // ─── Hibernatable WebSocket hooks ────────────────────────────────
  // Browsers are read-only subscribers: they connect, receive diffs,
  // close. No incoming messages expected.

  async webSocketMessage(_ws: WebSocket, _msg: string | ArrayBuffer) {}

  async webSocketClose(
    ws: WebSocket,
    code: number,
    _reason: string,
    _wasClean: boolean,
  ) {
    try {
      ws.close(code);
    } catch {}
  }

  // ─── internals ───────────────────────────────────────────────────

  private async persist(): Promise<void> {
    await this.ctx.storage.put(STORAGE_KEY, this.grid.buffer.slice(0));
  }

  private broadcast(diff: Pixel[]): void {
    const msg = JSON.stringify(diff);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(msg);
      } catch {}
    }
  }
}

function inBounds(x: number, y: number): boolean {
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    x < WIDTH &&
    y >= 0 &&
    y < HEIGHT
  );
}
