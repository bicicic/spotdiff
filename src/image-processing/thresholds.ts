export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const n = sorted.length;
  return n % 2 ? sorted[n >> 1] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}
export function automaticThreshold(sample: number[], sensitivity: number) {
  const center = median(sample);
  const mad = median(sample.map((v) => Math.abs(v - center)));
  const s = Math.max(0, Math.min(100, sensitivity));
  // An absolute floor prevents tiny numeric/JPEG noise becoming differences when MAD is zero.
  return Math.max(
    4 + (100 - s) * 0.06,
    center + (6 - s * 0.04) * Math.max(1, mad),
  );
}
