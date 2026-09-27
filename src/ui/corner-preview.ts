import type { ImageSlot, Quad } from "../types";
import { commonSize } from "../image-processing/geometry";
// Map a unit rectangle to the selected quadrilateral for a lightweight preview.
// The actual comparison uses OpenCV's full-resolution warpPerspective.
export function quadMapping(q: Quad) {
  const [a, b, c, d] = q;
  const dx1 = b.x - c.x,
    dx2 = d.x - c.x,
    dx3 = a.x - b.x + c.x - d.x;
  const dy1 = b.y - c.y,
    dy2 = d.y - c.y,
    dy3 = a.y - b.y + c.y - d.y;
  const determinant = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / determinant;
  const h = (dx1 * dy3 - dx3 * dy1) / determinant;
  return (u: number, v: number) => {
    const z = g * u + h * v + 1;
    return {
      x: ((b.x - a.x + g * b.x) * u + (d.x - a.x + h * d.x) * v + a.x) / z,
      y: ((b.y - a.y + g * b.y) * u + (d.y - a.y + h * d.y) * v + a.y) / z,
    };
  };
}
export function updatePreview(canvas: HTMLCanvasElement, slot: ImageSlot) {
  const src = slot.pixels;
  const size = commonSize(
    slot.corners,
    src.width,
    src.height,
    slot.corners,
    src.width,
    src.height,
  );
  const scale = Math.min(1, 320 / Math.max(size.width, size.height));
  canvas.width = Math.max(2, Math.round(size.width * scale));
  canvas.height = Math.max(2, Math.round(size.height * scale));
  const ctx = canvas.getContext("2d")!,
    out = ctx.createImageData(canvas.width, canvas.height),
    map = quadMapping(slot.corners);
  for (let y = 0; y < canvas.height; y++)
    for (let x = 0; x < canvas.width; x++) {
      const p = map(x / (canvas.width - 1), y / (canvas.height - 1));
      const sx = Math.max(
        0,
        Math.min(src.width - 1, Math.round(p.x * (src.width - 1))),
      );
      const sy = Math.max(
        0,
        Math.min(src.height - 1, Math.round(p.y * (src.height - 1))),
      );
      const from = (sy * src.width + sx) * 4,
        to = (y * canvas.width + x) * 4;
      out.data[to] = src.data[from];
      out.data[to + 1] = src.data[from + 1];
      out.data[to + 2] = src.data[from + 2];
      out.data[to + 3] = 255;
    }
  ctx.putImageData(out, 0, 0);
}
