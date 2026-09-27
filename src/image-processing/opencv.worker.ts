import type {
  ImageSlot,
  ProcessingResult,
  WorkerRequest,
  WorkerResponse,
} from "../types";
import { commonSize, validQuad } from "./geometry";
import { automaticThreshold } from "./thresholds";
import { brightnessCorrection } from "./normalization";

// The OpenCV distribution has runtime-dependent Embind bindings.
// Keep these untyped bindings confined to the worker.
const scope = globalThis as any;
let cv: any;
let cached:
  | {
      width: number;
      height: number;
      first: Uint8ClampedArray;
      second: Uint8ClampedArray;
      scores: Float32Array;
      valid: Uint8Array;
      warning?: string;
    }
  | undefined;
const send = (message: WorkerResponse) => scope.postMessage(message);
function arena() {
  const owned: any[] = [];
  return {
    own<T>(v: T): T {
      owned.push(v);
      return v;
    },
    dispose() {
      for (const v of owned.reverse()) v.delete();
    },
  };
}
function percentile(
  data: Uint8Array,
  channel: number,
  p: number,
  valid: Uint8Array,
) {
  const bins = new Uint32Array(256);
  let count = 0;
  for (let i = channel; i < data.length; i += 3)
    if (valid[(i - channel) / 3]) {
      bins[data[i]]++;
      count++;
    }
  const target = Math.max(1, count * p);
  let sum = 0;
  for (let i = 0; i < 256; i++) {
    sum += bins[i];
    if (sum >= target) return i;
  }
  return 0;
}

function analyze(first: ImageSlot, second: ImageSlot, id: number) {
  if (!validQuad(first.corners) || !validQuad(second.corners))
    throw new Error("4隅の位置を確認してください。");
  const { width: w, height: h } = commonSize(
    first.corners,
    first.pixels.width,
    first.pixels.height,
    second.corners,
    second.pixels.width,
    second.pixels.height,
  );
  const a = arena(),
    own = a.own;
  try {
    send({
      type: "progress",
      id,
      message: "4隅をもとに傾き・遠近感を補正しています…",
    });
    const destination = own(
      cv.matFromArray(4, 1, cv.CV_32FC2, [
        0,
        0,
        w - 1,
        0,
        w - 1,
        h - 1,
        0,
        h - 1,
      ]),
    );
    function warp(slot: ImageSlot) {
      const src = own(cv.matFromImageData(slot.pixels));
      const points = own(
        cv.matFromArray(
          4,
          1,
          cv.CV_32FC2,
          slot.corners.flatMap((p) => [
            p.x * (src.cols - 1),
            p.y * (src.rows - 1),
          ]),
        ),
      );
      const matrix = own(cv.getPerspectiveTransform(points, destination));
      const out = own(new cv.Mat());
      cv.warpPerspective(
        src,
        out,
        matrix,
        new cv.Size(w, h),
        cv.INTER_LINEAR,
        cv.BORDER_REPLICATE,
      );
      return out;
    }
    const one = warp(first);
    let two = warp(second);
    const gray1 = own(new cv.Mat()),
      gray2 = own(new cv.Mat());
    cv.cvtColor(one, gray1, cv.COLOR_RGBA2GRAY);
    cv.cvtColor(two, gray2, cv.COLOR_RGBA2GRAY);
    let warning: string | undefined;
    let validMat = own(new cv.Mat(h, w, cv.CV_8UC1, new cv.Scalar(255)));
    send({ type: "progress", id, message: "小さな位置ずれを調整しています…" });
    const registration = arena();
    try {
      const take = registration.own;
      const orb = take(new cv.ORB(1200));
      const kp1 = take(new cv.KeyPointVector()),
        kp2 = take(new cv.KeyPointVector());
      const d1 = take(new cv.Mat()),
        d2 = take(new cv.Mat()),
        empty = take(new cv.Mat());
      orb.detectAndCompute(gray1, empty, kp1, d1);
      orb.detectAndCompute(gray2, empty, kp2, d2);
      if (d1.empty() || d2.empty()) throw new Error("特徴点不足");
      const matcher = take(new cv.BFMatcher(cv.NORM_HAMMING, false));
      const matches = take(new cv.DMatchVectorVector());
      matcher.knnMatch(d2, d1, matches, 2);
      const source: number[] = [],
        target: number[] = [];
      for (let i = 0; i < matches.size(); i++) {
        const pair = matches.get(i);
        try {
          if (pair.size() < 2) continue;
          const m = pair.get(0),
            n = pair.get(1);
          if (m.distance < 0.72 * n.distance) {
            const p = kp2.get(m.queryIdx).pt,
              q = kp1.get(m.trainIdx).pt;
            source.push(p.x, p.y);
            target.push(q.x, q.y);
          }
        } finally {
          pair.delete();
        }
      }
      if (source.length < 24) throw new Error("特徴点不足");
      const src = take(
        cv.matFromArray(source.length / 2, 1, cv.CV_32FC2, source),
      );
      const dst = take(
        cv.matFromArray(target.length / 2, 1, cv.CV_32FC2, target),
      );
      const inliers = take(new cv.Mat());
      const matrix = take(cv.findHomography(src, dst, cv.RANSAC, 2, inliers));
      if (matrix.empty() || cv.countNonZero(inliers) < 12)
        throw new Error("対応点不足");
      const m = matrix.data64F;
      const scaleX = Math.hypot(m[0], m[3]),
        scaleY = Math.hypot(m[1], m[4]);
      if (
        !Array.from(m as Float64Array).every(Number.isFinite) ||
        scaleX < 0.95 ||
        scaleX > 1.05 ||
        scaleY < 0.95 ||
        scaleY > 1.05 ||
        Math.abs(Math.atan2(m[3], m[0])) > Math.PI / 60
      )
        throw new Error("変形量過大");
      for (const [x, y] of [
        [0, 0],
        [w, 0],
        [w, h],
        [0, h],
      ]) {
        const z = m[6] * x + m[7] * y + m[8];
        const dx = (m[0] * x + m[1] * y + m[2]) / z - x;
        const dy = (m[3] * x + m[4] * y + m[5]) / z - y;
        if (
          !Number.isFinite(dx + dy) ||
          Math.abs(dx) > w * 0.03 ||
          Math.abs(dy) > h * 0.03
        )
          throw new Error("移動量過大");
      }
      const aligned = own(new cv.Mat()),
        mask = own(new cv.Mat());
      cv.warpPerspective(
        two,
        aligned,
        matrix,
        new cv.Size(w, h),
        cv.INTER_LINEAR,
        cv.BORDER_REPLICATE,
      );
      cv.warpPerspective(
        validMat,
        mask,
        matrix,
        new cv.Size(w, h),
        cv.INTER_NEAREST,
        cv.BORDER_CONSTANT,
        new cv.Scalar(0),
      );
      two = aligned;
      validMat = mask;
    } catch {
      warning =
        "自動位置合わせが十分にできませんでした。4隅補正だけで比較しています。輪郭全体が光る場合は4隅を調整してください。";
    } finally {
      registration.dispose();
    }
    const valid = new Uint8Array(validMat.data);
    const border = Math.max(2, Math.ceil(Math.min(w, h) * 0.01));
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (x < border || y < border || x >= w - border || y >= h - border)
          valid[y * w + x] = 0;
    send({
      type: "progress",
      id,
      message: "明るさ・色かぶり・撮影ノイズを補正しています…",
    });
    function lab(rgba: any) {
      const rgb = own(new cv.Mat()),
        result = own(new cv.Mat());
      cv.cvtColor(rgba, rgb, cv.COLOR_RGBA2RGB);
      cv.GaussianBlur(rgb, rgb, new cv.Size(5, 5), 1.2);
      cv.cvtColor(rgb, result, cv.COLOR_RGB2Lab);
      return result;
    }
    const lab1 = lab(one),
      lab2 = lab(two);
    const lo1 = percentile(lab1.data, 0, 0.1, valid),
      hi1 = percentile(lab1.data, 0, 0.9, valid);
    const lo2 = percentile(lab2.data, 0, 0.1, valid),
      hi2 = percentile(lab2.data, 0, 0.9, valid);
    const { gain, offset } = brightnessCorrection(
      { low: lo1, high: hi1, median: percentile(lab1.data, 0, 0.5, valid) },
      { low: lo2, high: hi2, median: percentile(lab2.data, 0, 0.5, valid) },
    );
    const ca =
      percentile(lab1.data, 1, 0.5, valid) -
      percentile(lab2.data, 1, 0.5, valid);
    const cb =
      percentile(lab1.data, 2, 0.5, valid) -
      percentile(lab2.data, 2, 0.5, valid);
    const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
    for (let i = 0; i < lab2.data.length; i += 3) {
      lab2.data[i] = clamp(lab2.data[i] * gain + offset);
      lab2.data[i + 1] = clamp(lab2.data[i + 1] + ca);
      lab2.data[i + 2] = clamp(lab2.data[i + 2] + cb);
    }
    const rgb2 = own(new cv.Mat()),
      corrected = own(new cv.Mat());
    cv.cvtColor(lab2, rgb2, cv.COLOR_Lab2RGB);
    cv.cvtColor(rgb2, corrected, cv.COLOR_RGB2RGBA);
    const gradient = (labImage: any) => {
      const l = own(new cv.Mat(h, w, cv.CV_8UC1)),
        dx = own(new cv.Mat()),
        dy = own(new cv.Mat()),
        mag = own(new cv.Mat());
      for (let i = 0; i < w * h; i++) l.data[i] = labImage.data[i * 3];
      cv.Sobel(l, dx, cv.CV_32F, 1, 0, 3, 0.25);
      cv.Sobel(l, dy, cv.CV_32F, 0, 1, 3, 0.25);
      cv.magnitude(dx, dy, mag);
      return mag;
    };
    const g1 = gradient(lab1),
      g2 = gradient(lab2);
    const scores = new Float32Array(w * h);
    const difference = (i: number, j: number) => {
      const p = i * 3,
        q = j * 3;
      const dl = ((lab1.data[p] - lab2.data[q]) * 100) / 255;
      const da = lab1.data[p + 1] - lab2.data[q + 1];
      const db = lab1.data[p + 2] - lab2.data[q + 2];
      const edgeA = g1.data32F[i],
        edgeB = g2.data32F[j];
      // Resampling changes edge strength even when its position/shape matches.
      // Allow a relative strength difference; a missing edge still contributes.
      const edgeDifference = Math.max(
        0,
        Math.abs(edgeA - edgeB) - 0.5 * Math.max(edgeA, edgeB),
      );
      return 0.7 * Math.hypot(dl, da, db) + 0.3 * edgeDifference;
    };
    for (let i = 0; i < scores.length; i++) {
      if (!valid[i]) continue;
      let forward = difference(i, i),
        reverse = forward;
      // A two-pixel symmetric tolerance absorbs interpolation/registration halos
      // and subpixel rounding of touch coordinates on scaled mobile canvases.
      // Both directions are required so additions and deletions remain visible.
      if (forward >= 4) {
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const j = i + dy * w + dx;
            if (!valid[j]) continue;
            forward = Math.min(forward, difference(i, j));
            reverse = Math.min(reverse, difference(j, i));
          }
      }
      scores[i] = Math.max(forward, reverse);
    }
    cached = {
      width: w,
      height: h,
      first: new Uint8ClampedArray(one.data),
      second: new Uint8ClampedArray(corrected.data),
      scores,
      valid,
      warning,
    };
  } finally {
    a.dispose();
  }
}

function refine(sensitivity: number): ProcessingResult {
  if (!cached) throw new Error("画像をもう一度比較してください。");
  const { width: w, height: h, scores, valid } = cached;
  const a = arena(),
    own = a.own;
  try {
    const sample: number[] = [];
    for (
      let i = 0;
      i < scores.length;
      i += Math.max(1, Math.floor(scores.length / 30000))
    )
      if (valid[i]) sample.push(scores[i]);
    const threshold = automaticThreshold(sample, sensitivity);
    const mask = own(new cv.Mat(h, w, cv.CV_8UC1));
    for (let i = 0; i < scores.length; i++)
      mask.data[i] = valid[i] && scores[i] > threshold ? 255 : 0;
    const kernel = own(
      cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3)),
    );
    cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kernel);
    cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel);
    const contours = own(new cv.MatVector()),
      hierarchy = own(new cv.Mat());
    cv.findContours(
      mask,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE,
    );
    const clean = own(cv.Mat.zeros(h, w, cv.CV_8UC1));
    let regions = 0;
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      try {
        if (cv.contourArea(contour) >= Math.max(9, w * h * 0.0003)) {
          cv.drawContours(clean, contours, i, new cv.Scalar(255), cv.FILLED);
          regions++;
        }
      } finally {
        contour.delete();
      }
    }
    const heat = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < scores.length; i++)
      if (clean.data[i] && valid[i]) {
        const strength = Math.min(
          1,
          Math.max(0, (scores[i] - threshold) / Math.max(20, threshold * 2)),
        );
        heat[i * 4] = 255;
        heat[i * 4 + 1] = Math.round(210 * (1 - strength));
        heat[i * 4 + 2] = 25;
        heat[i * 4 + 3] = 210;
      }
    return {
      width: w,
      height: h,
      first: cached.first,
      second: cached.second,
      heat,
      regions,
      warning: cached.warning,
    };
  } finally {
    a.dispose();
  }
}

scope.onmessage = async ({ data }: { data: WorkerRequest }) => {
  try {
    if (data.type === "load") {
      scope.importScripts(data.url);
      // This build exposes an Emscripten thenable resolving to itself, not a Promise.
      // Awaiting it directly would cause infinite Promise assimilation.
      await new Promise<void>((resolve, reject) => {
        const module = scope.cv;
        module.onAbort = () =>
          reject(new Error("画像処理の初期化に失敗しました。"));
        if (module.Mat) {
          cv = module;
          resolve();
        } else
          module.then((loaded: any) => {
            cv = loaded;
            resolve();
          });
      });
      if (!cv?.Mat) throw new Error("OpenCVを初期化できませんでした。");
      send({ type: "ready" });
      return;
    }
    if (!cv) throw new Error("画像処理の準備が完了していません。");
    if (data.type === "analyze") analyze(data.first, data.second, data.id);
    send({
      type: "result",
      id: data.id,
      result: refine(data.options.sensitivity),
    });
  } catch (error) {
    console.error("OpenCV processing error", error);
    send({
      type: "error",
      id: "id" in data ? data.id : undefined,
      message:
        error instanceof Error && /[ぁ-んァ-ヶ一-龯]/.test(error.message)
          ? error.message
          : "画像処理に失敗しました。画像を小さくするか、4隅を調整して再試行してください。",
    });
  }
};
