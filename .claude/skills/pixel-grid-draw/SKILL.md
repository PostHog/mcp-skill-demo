---
name: pixel-grid-draw
description: Draw 2D shapes (filled rectangles, outlined frames, ASCII bitmaps) on the 32×32 MCP pixel grid. Use this skill whenever the user asks to draw a square, rectangle, box, frame, outline, border, sprite, or other 2D shape on the pixel grid, or when the task involves placing a block or bitmap at specific grid coordinates. The pixel-grid MCP server only exposes a 1D `write(offset, bits)` primitive; this skill compiles a 2D drawing into the sequence of `write` calls that implements it.
---

# pixel-grid-draw

The `pixel-grid` MCP server exposes a linear write primitive:

    write(offset: int, bits: str)

where `offset ∈ [0, 1024)` and `bits` is a string of `'0'` (white), `'1'`
(black), or `'.'` (skip, leave cell unchanged). The grid is 32×32,
row-major: `offset = y * 32 + x`.

Drawing 2D shapes in terms of `write` is mechanical but tedious: row
offsets must be computed, and cells that should remain untouched need
`.` in the right places. This skill does the mechanical part so you
can focus on the shape.

## How to use

1. Decide the 2D operation (rect / frame / bitmap) and its position.
2. Run `scripts/plan.py` with those args. It emits JSON of the form:

   ```json
   { "ops": [ { "offset": <int>, "bits": "<string>" }, ... ] }
   ```

3. For each op in the list, call the pixel-grid `write` MCP tool with
   those exact args.

Each command emits **one op per row** of the shape. This is
deliberate: packing a multi-row shape into a single long `bits`
string requires 2D-through-1D padding (`.` runs spanning the cells
between row ends and the next row's start), which balloons a dense
shape into a highly repetitive multi-kilobyte string — exactly the
input an LLM is most likely to miscopy. Per-row keeps every `bits`
value at most 64 chars with a distinct offset, and the ops are
independent so you can fire them in parallel.

The script never touches the network; it's a pure translator. You are
still the one making the MCP call, which means the write is visible
in the tool-call trace.

## Commands

### Filled rectangle

    scripts/plan.py rect X Y W H

Fills a `W × H` block with black starting at `(X, Y)`. Any previous
content underneath is overwritten (cells set to `1`).

### Outlined frame

    scripts/plan.py frame X Y W H

1-pixel outline of a `W × H` rectangle at `(X, Y)`. Interior cells use
`.` (skip), so the frame draws *around* existing content without
clobbering it.

### Arbitrary bitmap

    scripts/plan.py bitmap X Y

Reads the bitmap from stdin: one row per line, each character `0`
(white), `1` (black), or `.` (skip). Top-left of the bitmap is placed
at `(X, Y)`.

Example — a 5×4 hollow oval at (10, 10):

    printf '01110\n10001\n10001\n01110\n' | \
      scripts/plan.py bitmap 10 10

### Clipping

Coordinates and dimensions may fall outside the grid; the plan is
clipped to `0..63` on both axes. Rows/columns that fall off the edge
are dropped silently. No op references pixels outside the grid.

## Example session

User asks: *"Draw a 10×10 square at position (5, 5) and put a frame
around it at (3, 3)."*

1. `python3 scripts/plan.py rect 5 5 10 10` → 10 ops (one per row).
2. `python3 scripts/plan.py frame 3 3 14 14` → 14 ops. Middle rows
   use `.` for the interior cells so the frame draws cleanly around
   the rectangle without erasing any part of it.
3. Call `write(offset, bits)` on the pixel-grid MCP server for each
   op. The 24 calls are independent; fire them in parallel.

## Notes

- If you want a blank canvas first, call the pixel-grid `clear` tool.
- For very small shapes, it may be quicker to compose the `bits`
  string yourself and call `write` directly. Use this skill when the
  shape spans multiple rows or when an ASCII-art bitmap is more
  natural than hand-computed offsets.
