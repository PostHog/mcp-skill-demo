#!/usr/bin/env python3
"""
Compile a 2D drawing operation into a list of 1D write ops for the
pixel-grid MCP server.

This script is a pure translator: it reads a 2D description, emits a
JSON plan, and exits. It does not touch the network. The caller (your
agent) is responsible for running each op as a pixel-grid `write` tool
call.

Output shape:

    { "ops": [ { "offset": <int>, "bits": "<01.-string>" }, ... ] }

Each op maps to one `write(offset, bits)` MCP call. The grid is 32x32
row-major: offset = y * 32 + x. `.` in `bits` leaves the cell unchanged.

Subcommands:

    plan.py rect  X Y W H           Filled W x H rectangle at (X, Y).
    plan.py frame X Y W H           1-pixel outline of a W x H rect;
                                     interior preserved via `.` skips.
    plan.py bitmap X Y              Read rows from stdin, one per line,
                                     each containing only '0', '1', or '.'.
                                     Top-left placed at (X, Y).

Coordinates and dimensions may be negative or exceed the grid; the
plan is clipped to 0..31 on both axes. Out-of-bounds rows/columns are
dropped silently.
"""

import json
import sys

WIDTH = 32
HEIGHT = 32


def ops_from_rows(x: int, y: int, rows: list[str]) -> list[dict]:
    """Clip rows to the grid and emit ONE op per surviving row.

    Per-row is deliberate: packing a shape into a single long bits
    string requires 2D-through-1D padding that makes the write
    payload mostly `.` repetition — exactly the pattern an LLM is
    likely to mis-transcribe. Per-row keeps every `bits` value at
    most WIDTH chars, with each call carrying a distinct offset, so
    the emission stays reliable and a dropped row is visible.
    """
    ops: list[dict] = []
    for i, bits in enumerate(rows):
        py = y + i
        if py < 0 or py >= HEIGHT:
            continue

        # Horizontal clip.
        px = x
        if px < 0:
            bits = bits[-px:]
            px = 0
        if px >= WIDTH:
            continue
        if px + len(bits) > WIDTH:
            bits = bits[: WIDTH - px]
        if not bits:
            continue

        ops.append({"offset": py * WIDTH + px, "bits": bits})
    return ops


def cmd_rect(x: int, y: int, w: int, h: int) -> list[dict]:
    if w <= 0 or h <= 0:
        return []
    return ops_from_rows(x, y, ["1" * w] * h)


def cmd_frame(x: int, y: int, w: int, h: int) -> list[dict]:
    if w <= 0 or h <= 0:
        return []
    if h == 1:
        return ops_from_rows(x, y, ["1" * w])
    if w == 1:
        return ops_from_rows(x, y, ["1"] * h)
    top = "1" * w
    mid = "1" + "." * (w - 2) + "1"
    return ops_from_rows(x, y, [top, *([mid] * (h - 2)), top])


def cmd_bitmap(x: int, y: int) -> list[dict]:
    rows = [line.rstrip("\n") for line in sys.stdin]
    while rows and not rows[-1]:
        rows.pop()
    if not rows:
        return []
    for i, row in enumerate(rows):
        bad = [c for c in row if c not in "01."]
        if bad:
            sys.exit(
                f"row {i}: unexpected character {bad[0]!r} "
                f"(bitmap cells must be '0', '1', or '.')"
            )
    return ops_from_rows(x, y, rows)


def main() -> None:
    argv = sys.argv[1:]
    if not argv:
        sys.exit("usage: plan.py <rect|frame|bitmap> ...")
    cmd, *rest = argv

    try:
        if cmd in ("rect", "frame"):
            if len(rest) != 4:
                sys.exit(f"usage: plan.py {cmd} X Y W H")
            x, y, w, h = (int(v) for v in rest)
            ops = cmd_rect(x, y, w, h) if cmd == "rect" else cmd_frame(x, y, w, h)
        elif cmd == "bitmap":
            if len(rest) != 2:
                sys.exit("usage: plan.py bitmap X Y  (rows from stdin)")
            x, y = (int(v) for v in rest)
            ops = cmd_bitmap(x, y)
        else:
            sys.exit(f"unknown command: {cmd!r}")
    except ValueError as e:
        sys.exit(f"bad integer argument: {e}")

    json.dump({"ops": ops}, sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
