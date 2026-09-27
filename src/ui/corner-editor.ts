import type { ImageSlot } from "../types";
import { validQuad } from "../image-processing/geometry";
import { pixelCanvas } from "./image-input";
import { updatePreview } from "./corner-preview";
const names = ["左上", "右上", "右下", "左下"];
export function mountCornerEditor(
  host: HTMLElement,
  slot: ImageSlot,
  changed: () => void,
) {
  host.innerHTML = `<div class="editor-stage"><canvas class="corner-canvas" tabindex="0" aria-label="4隅の調整。下のボタンで角を選び、矢印キーで微調整できます。"></canvas><canvas class="loupe" width="144" height="144" hidden></canvas></div><div class="corner-buttons" role="group" aria-label="調整する角">${names.map((n, i) => `<button type="button" data-corner="${i}" aria-pressed="${i === 0}">${i + 1} ${n}</button>`).join("")}</div><p class="hint">同じ対象の4隅を囲んでください。ドラッグ中は拡大表示します。矢印キーでも調整できます。</p>`;
  const canvas = host.querySelector<HTMLCanvasElement>(".corner-canvas")!;
  const loupe = host.querySelector<HTMLCanvasElement>(".loupe")!;
  const image = pixelCanvas(slot.pixels);
  const previewSection = document.createElement("details");
  previewSection.open = true;
  previewSection.innerHTML =
    '<summary>補正プレビュー</summary><canvas aria-label="4隅補正後のプレビュー" style="display:block;max-width:100%;margin:12px auto"></canvas>';
  host.append(previewSection);
  const preview = previewSection.querySelector("canvas")!;
  let previewTimer: ReturnType<typeof setTimeout> | undefined;
  const ctx = canvas.getContext("2d")!;
  canvas.width = image.width;
  canvas.height = image.height;
  let selected = 0,
    dragging = false;
  function select(i: number) {
    selected = i;
    host
      .querySelectorAll<HTMLButtonElement>("[data-corner]")
      .forEach((b, j) => b.setAttribute("aria-pressed", String(j === i)));
  }
  function draw() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      preview.hidden = !validQuad(slot.corners);
      if (!preview.hidden) updatePreview(preview, slot);
    }, 100);
    const w = canvas.width,
      h = canvas.height,
      scale = w / (canvas.clientWidth || w),
      radius = 13 * scale;
    ctx.drawImage(image, 0, 0);
    ctx.beginPath();
    slot.corners.forEach((p, i) =>
      i
        ? ctx.lineTo(p.x * (w - 1), p.y * (h - 1))
        : ctx.moveTo(p.x * (w - 1), p.y * (h - 1)),
    );
    ctx.closePath();
    ctx.fillStyle = "#145c501a";
    ctx.fill();
    ctx.lineWidth = 2.5 * scale;
    ctx.strokeStyle = validQuad(slot.corners) ? "#30ddae" : "#ff5347";
    ctx.stroke();
    slot.corners.forEach((p, i) => {
      const x = p.x * (w - 1),
        y = p.y * (h - 1);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = i === selected ? "#145c50" : "#ffffff";
      ctx.fill();
      ctx.strokeStyle = i === selected ? "#fff" : "#145c50";
      ctx.lineWidth = 2 * scale;
      ctx.stroke();
      ctx.font = `bold ${13 * scale}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = i === selected ? "#fff" : "#145c50";
      ctx.fillText(String(i + 1), x, y);
    });
  }
  function update(e: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    slot.corners[selected] = { x, y };
    draw();
    changed();
    const lc = loupe.getContext("2d")!;
    lc.fillStyle = "#e5e9e6";
    lc.fillRect(0, 0, 144, 144);
    lc.drawImage(
      image,
      x * (image.width - 1) - 36,
      y * (image.height - 1) - 36,
      72,
      72,
      0,
      0,
      144,
      144,
    );
    lc.strokeStyle = "#0c8a69";
    lc.lineWidth = 2;
    lc.beginPath();
    lc.moveTo(60, 72);
    lc.lineTo(84, 72);
    lc.moveTo(72, 60);
    lc.lineTo(72, 84);
    lc.stroke();
    loupe.hidden = false;
    loupe.style.left = x > 0.5 ? "12px" : "auto";
    loupe.style.right = x > 0.5 ? "auto" : "12px";
  }
  canvas.onpointerdown = (e) => {
    const r = canvas.getBoundingClientRect();
    const distance = slot.corners.map((p) =>
      Math.hypot(
        p.x * r.width - (e.clientX - r.left),
        p.y * r.height - (e.clientY - r.top),
      ),
    );
    const nearest = distance.indexOf(Math.min(...distance));
    if (distance[nearest] > 48) return;
    select(nearest);
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
    canvas.focus({ preventScroll: true });
    update(e);
  };
  canvas.onpointermove = (e) => {
    if (dragging) update(e);
  };
  const end = () => {
    dragging = false;
    loupe.hidden = true;
  };
  canvas.onpointerup = end;
  canvas.onpointercancel = end;
  canvas.onlostpointercapture = end;
  const keydown = (e: KeyboardEvent) => {
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    if (!directions[e.key]) return;
    e.preventDefault();
    const [dx, dy] = directions[e.key],
      step = e.shiftKey ? 10 : 1;
    const p = slot.corners[selected];
    p.x = Math.max(0, Math.min(1, p.x + (dx * step) / canvas.width));
    p.y = Math.max(0, Math.min(1, p.y + (dy * step) / canvas.height));
    draw();
    changed();
  };
  canvas.onkeydown = keydown;
  host.querySelectorAll<HTMLButtonElement>("[data-corner]").forEach((b) => {
    b.onclick = () => {
      select(Number(b.dataset.corner));
      draw();
    };
    b.onkeydown = keydown;
  });
  const observer = new ResizeObserver(draw);
  observer.observe(canvas);
  draw();
  return () => {
    observer.disconnect();
    clearTimeout(previewTimer);
  };
}
