import type { Quad } from "../types";
export function initialCorners(): Quad {
  return [
    { x: 0.05, y: 0.05 },
    { x: 0.95, y: 0.05 },
    { x: 0.95, y: 0.95 },
    { x: 0.05, y: 0.95 },
  ];
}
export function validQuad(q: Quad): boolean {
  if (
    q.some(
      (p) =>
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y) ||
        p.x < 0 ||
        p.x > 1 ||
        p.y < 0 ||
        p.y > 1,
    )
  )
    return false;
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i],
      b = q[(i + 1) % 4],
      c = q[(i + 2) % 4];
    if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) < 0.0005)
      return false;
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2 >= 0.01;
}
export function commonSize(
  a: Quad,
  aw: number,
  ah: number,
  b: Quad,
  bw: number,
  bh: number,
) {
  const dimensions = (q: Quad, w: number, h: number) => {
    const edge = (i: number, j: number) =>
      Math.hypot((q[i].x - q[j].x) * w, (q[i].y - q[j].y) * h);
    return [(edge(0, 1) + edge(3, 2)) / 2, (edge(0, 3) + edge(1, 2)) / 2];
  };
  const da = dimensions(a, aw, ah),
    db = dimensions(b, bw, bh);
  const ratio = Math.sqrt(((da[0] / da[1]) * db[0]) / db[1]);
  const longest = Math.min(1600, Math.max(...da), Math.max(...db));
  return ratio >= 1
    ? {
        width: Math.max(16, Math.round(longest)),
        height: Math.max(16, Math.round(longest / ratio)),
      }
    : {
        width: Math.max(16, Math.round(longest * ratio)),
        height: Math.max(16, Math.round(longest)),
      };
}
