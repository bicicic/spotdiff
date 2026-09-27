import { initialCorners } from "../image-processing/geometry";
import type { ImageSlot } from "../types";
export async function readImage(file: File): Promise<ImageSlot> {
  if (file.size > 10 * 1024 * 1024)
    throw new Error("1枚10MB以下の画像を選んでください。");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => {
      throw new Error(
        "この画像を読み込めません。JPEG・PNG・WebP形式の画像で再試行してください。",
      );
    });
    if (img.naturalWidth * img.naturalHeight > 24_000_000)
      throw new Error("1枚2,400万画素以下の画像を選んでください。");
    if (Math.min(img.naturalWidth, img.naturalHeight) < 32)
      throw new Error("縦・横とも32画素以上の画像を選んでください。");
    const scale = Math.min(
      1,
      1600 / Math.max(img.naturalWidth, img.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return {
      name: file.name,
      pixels: ctx.getImageData(0, 0, canvas.width, canvas.height),
      corners: initialCorners(),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function pixelCanvas(pixels: ImageData) {
  const canvas = document.createElement("canvas");
  canvas.width = pixels.width;
  canvas.height = pixels.height;
  canvas.getContext("2d")!.putImageData(pixels, 0, 0);
  return canvas;
}
export function rotateImage(slot: ImageSlot): ImageSlot {
  const source = pixelCanvas(slot.pixels),
    canvas = document.createElement("canvas");
  canvas.width = source.height;
  canvas.height = source.width;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(canvas.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(source, 0, 0);
  const [tl, tr, br, bl] = slot.corners;
  const rotate = (p: { x: number; y: number }) => ({ x: 1 - p.y, y: p.x });
  return {
    ...slot,
    pixels: ctx.getImageData(0, 0, canvas.width, canvas.height),
    corners: [rotate(bl), rotate(tl), rotate(tr), rotate(br)],
  };
}
