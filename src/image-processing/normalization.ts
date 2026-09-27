interface TonalRange {
  low: number;
  median: number;
  high: number;
}
export function brightnessCorrection(
  reference: TonalRange,
  sample: TonalRange,
) {
  const a = reference.high - reference.low;
  const b = sample.high - sample.low;
  // A mostly uniform page has no reliable contrast range. Dividing tiny ranges
  // would turn a little sensor noise into a large, artificial contrast change.
  const gain = a < 12 || b < 12 ? 1 : Math.max(0.6, Math.min(1.7, a / b));
  return { gain, offset: reference.median - gain * sample.median };
}
