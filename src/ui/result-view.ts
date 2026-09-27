import type { ProcessingResult } from "../types";
import { pixelCanvas } from "./image-input";
export function mountResult(host: HTMLElement, result: ProcessingResult) {
  const previous = {
    image: Number(
      host.querySelector<HTMLElement>('[data-image][aria-pressed="true"]')
        ?.dataset.image ?? 0,
    ),
    opacity: host.querySelector<HTMLInputElement>("#opacity")?.value ?? "65",
    zoom: host.querySelector<HTMLInputElement>("#zoom")?.value ?? "100",
    show: host.querySelector<HTMLInputElement>("#show-heat")?.checked ?? true,
    left: host.querySelector(".result-viewport")?.scrollLeft ?? 0,
    top: host.querySelector(".result-viewport")?.scrollTop ?? 0,
  };
  host.innerHTML = `<div class="result-toolbar"><div class="segmented" role="group" aria-label="表示する画像"><button data-image="0" aria-pressed="true">1枚目</button><button data-image="1" aria-pressed="false">2枚目</button></div><label class="check"><input type="checkbox" id="show-heat" checked> 差分を重ねる</label></div><div class="result-viewport" tabindex="0" aria-label="比較結果。拡大後はスクロールで移動できます。"><canvas></canvas></div><div class="view-controls"><label>拡大 <input id="zoom" type="range" min="100" max="400" value="100"> <output id="zoom-value">100%</output></label><label>重ねる濃さ <input id="opacity" type="range" min="0" max="100" value="65"></label></div><div class="legend"><span>差が弱い</span><i></i><span>差が強い</span></div><p class="hint">色は差の強さです。正解の確率ではありません。拡大後はスワイプやスクロールで移動できます。</p>`;
  const canvas = host.querySelector("canvas")!,
    ctx = canvas.getContext("2d")!;
  const sources = [result.first, result.second].map((data) =>
    pixelCanvas(
      new ImageData(new Uint8ClampedArray(data), result.width, result.height),
    ),
  );
  const heat = pixelCanvas(
    new ImageData(
      new Uint8ClampedArray(result.heat),
      result.width,
      result.height,
    ),
  );
  canvas.width = result.width;
  canvas.height = result.height;
  let selected = previous.image;
  const show = host.querySelector<HTMLInputElement>("#show-heat")!,
    opacity = host.querySelector<HTMLInputElement>("#opacity")!;
  show.checked = previous.show;
  opacity.value = previous.opacity;
  host.querySelector<HTMLInputElement>("#zoom")!.value = previous.zoom;
  host.querySelector("#zoom-value")!.textContent = `${previous.zoom}%`;
  canvas.style.width = `${previous.zoom}%`;
  host.querySelector(".result-viewport")!.scrollLeft = previous.left;
  host.querySelector(".result-viewport")!.scrollTop = previous.top;
  host
    .querySelectorAll<HTMLButtonElement>("[data-image]")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(Number(button.dataset.image) === selected),
      ),
    );
  function draw() {
    ctx.globalAlpha = 1;
    ctx.drawImage(sources[selected], 0, 0);
    if (show.checked) {
      ctx.globalAlpha = Number(opacity.value) / 100;
      ctx.drawImage(heat, 0, 0);
      ctx.globalAlpha = 1;
    }
  }
  host.querySelectorAll<HTMLButtonElement>("[data-image]").forEach(
    (b) =>
      (b.onclick = () => {
        selected = Number(b.dataset.image);
        host
          .querySelectorAll<HTMLButtonElement>("[data-image]")
          .forEach((el) =>
            el.setAttribute(
              "aria-pressed",
              String(Number(el.dataset.image) === selected),
            ),
          );
        draw();
      }),
  );
  show.onchange = draw;
  opacity.oninput = draw;
  host.querySelector<HTMLInputElement>("#zoom")!.oninput = (e) => {
    const value = (e.target as HTMLInputElement).value;
    canvas.style.width = `${value}%`;
    host.querySelector("#zoom-value")!.textContent = `${value}%`;
  };
  draw();
}
