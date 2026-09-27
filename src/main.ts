import "./styles.css";
import type { ImageSlot, ProcessingResult, Step } from "./types";
import { previousStep } from "./app/state";
import { validQuad, initialCorners } from "./image-processing/geometry";
import { Processor } from "./image-processing/worker-client";
import { readImage, rotateImage, pixelCanvas } from "./ui/image-input";
import { mountCornerEditor } from "./ui/corner-editor";
import { mountResult } from "./ui/result-view";

const app = document.querySelector<HTMLDivElement>("#app")!;
const processor = new Processor();
const slots: (ImageSlot | undefined)[] = [undefined, undefined];
let step: Step = "input",
  sensitivity = 50,
  result: ProcessingResult | undefined;
let cleanEditor: (() => void) | undefined,
  generation = 0,
  debounce: ReturnType<typeof setTimeout> | undefined;
let error = "",
  busy = false;
function escape(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
function invalidate() {
  generation++;
  clearTimeout(debounce);
  result = undefined;
}
function setStep(next: Step) {
  cleanEditor?.();
  cleanEditor = undefined;
  step = next;
  error = "";
  render();
  window.scrollTo(0, 0);
  app.querySelector<HTMLElement>("h1")?.focus();
}
function alertError(e: unknown) {
  error =
    e instanceof Error ? e.message : "処理に失敗しました。再試行してください。";
  const box = document.querySelector<HTMLElement>("#error");
  if (box) {
    box.textContent = error;
    box.hidden = false;
  }
}
function render() {
  const current = step === "input" ? 1 : step.startsWith("corners") ? 2 : 3;
  app.innerHTML = `<header class="site-header"><a class="brand" href="./" aria-label="spotdiff ホーム"><span class="brand-mark">◈</span> spotdiff</a><span class="privacy">画像は端末の中だけで処理</span></header><main><nav class="steps" aria-label="進行状況">${["写真を選ぶ", "4隅を合わせる", "違いを見つける"].map((label, i) => `<span class="${current === i + 1 ? "active" : current > i + 1 ? "done" : ""}" ${current === i + 1 ? 'aria-current="step"' : ""}><b>${i + 1}</b>${label}</span>`).join("")}</nav><div id="error" class="error" role="alert" ${error ? "" : "hidden"}>${escape(error)}</div><section id="content"></section></main><footer>写真で間違い探し · 保存・送信なし<br><small>再読み込みすると画像と結果は消去されます。</small></footer>`;
  if (step === "input") renderInput();
  else if (step.startsWith("corners")) renderCorners();
  else if (step === "processing") renderProcessing();
  else renderResult();
}
function content() {
  return document.querySelector<HTMLElement>("#content")!;
}
function renderInput() {
  content().innerHTML = `<div class="intro"><p class="eyebrow">ふたつの写真を、ひとつの視点に。</p><h1 tabindex="-1">写真から、<br class="mobile-break">違いを見つけよう。</h1><p>傾きや明るさを合わせて、間違いの候補を色で表示します。</p></div><div class="input-grid">${[0, 1].map((i) => `<article class="image-card"><div class="card-heading"><h2><span class="number">0${i + 1}</span> ${i + 1}枚目の写真</h2>${slots[i] ? '<span class="badge">選択済み</span>' : ""}</div><div class="image-placeholder" id="thumbnail-${i}">${slots[i] ? "" : '<span class="photo-icon">▧</span><p>比較する絵を選んでください</p>'}</div><p class="filename">${slots[i] ? escape(slots[i]!.name) : "JPEG・PNG・WebP / 10MB・2,400万画素まで"}</p><div class="input-actions"><label class="button secondary">撮影<input type="file" accept="image/*" capture="environment" data-slot="${i}" aria-label="${i + 1}枚目を撮影"></label><label class="button secondary">画像を選択<input type="file" accept="image/*" data-slot="${i}" aria-label="${i + 1}枚目の画像を選択"></label></div></article>`).join("")}</div><aside class="tips"><strong>きれいに比較するコツ</strong><p>同じ絵の4隅が写るように、同じ向きで撮影してください。強い影・反射・ピンぼけを避けると見つけやすくなります。</p><small>絵・印刷物向けです。湾曲・凹凸や微小な点・細線は正確に検出できない場合があります。</small></aside><div class="actions"><button id="next" class="primary" ${slots.every(Boolean) && !busy ? "" : "disabled"}>4隅を合わせる <span>→</span></button></div>`;
  slots.forEach((slot, i) => {
    if (slot)
      document
        .querySelector(`#thumbnail-${i}`)!
        .append(pixelCanvas(slot.pixels));
  });
  content()
    .querySelectorAll<HTMLInputElement>("input[type=file]")
    .forEach(
      (input) =>
        (input.onchange = async () => {
          const file = input.files?.[0];
          if (!file || busy) return;
          busy = true;
          const next = document.querySelector<HTMLButtonElement>("#next")!;
          next.disabled = true;
          next.textContent = "画像を読み込んでいます…";
          content()
            .querySelectorAll<HTMLInputElement>("input[type=file]")
            .forEach((el) => (el.disabled = true));
          try {
            slots[Number(input.dataset.slot)] = await readImage(file);
            invalidate();
            error = "";
          } catch (e) {
            error =
              e instanceof Error ? e.message : "画像を読み込めませんでした。";
          } finally {
            busy = false;
            render();
          }
        }),
    );
  document.querySelector<HTMLButtonElement>("#next")!.onclick = () =>
    setStep("corners-first");
}
function renderCorners() {
  const index = step === "corners-first" ? 0 : 1,
    slot = slots[index]!;
  content().innerHTML = `<div class="section-heading"><p class="eyebrow">写真 ${index + 1} / 2</p><h1 tabindex="-1">絵の4隅を合わせる</h1><p>番号のついた丸を、比較する絵の角へ動かしてください。</p></div><div class="editor-card"><div class="editor-tools"><span>${escape(slot.name)}</span><button id="rotate" class="text-button">↻ 90°回転</button><button id="reset-corners" class="text-button">4隅を戻す</button></div><div id="editor"></div><p id="quad-error" class="error" role="status" hidden>四角形が交差しているか、小さすぎます。左上→右上→右下→左下の順に囲んでください。</p></div><p class="hint">撮影した実物の正確な縦横比ではなく、2枚に共通の比率へ補正します。比較後も4隅を修正できます。</p><div class="actions split"><button id="back" class="secondary">← 戻る</button><button id="next" class="primary">${index === 0 ? "2枚目の4隅へ →" : "補正して比較する →"}</button></div>`;
  const changed = () => {
    invalidate();
    const valid = validQuad(slot.corners);
    document.querySelector<HTMLButtonElement>("#next")!.disabled = !valid;
    document.querySelector<HTMLElement>("#quad-error")!.hidden = valid;
  };
  cleanEditor = mountCornerEditor(
    document.querySelector("#editor")!,
    slot,
    changed,
  );
  changed();
  document.querySelector<HTMLButtonElement>("#rotate")!.onclick = () => {
    slots[index] = rotateImage(slot);
    invalidate();
    setStep(step);
  };
  document.querySelector<HTMLButtonElement>("#reset-corners")!.onclick = () => {
    slot.corners = initialCorners();
    invalidate();
    setStep(step);
  };
  document.querySelector<HTMLButtonElement>("#back")!.onclick = () =>
    setStep(previousStep(step));
  document.querySelector<HTMLButtonElement>("#next")!.onclick = () =>
    index === 0 ? setStep("corners-second") : void compare();
}
function renderProcessing() {
  content().innerHTML = `<div class="processing"><div class="spinner" aria-hidden="true"></div><h1 tabindex="-1">2枚の写真を比較中</h1><p id="progress" role="status">画像処理の準備をしています…</p><p class="hint">写真は端末の外へ送信されません。初回は準備に時間がかかることがあります。</p><button id="cancel" class="secondary">中断して4隅に戻る</button></div>`;
  document.querySelector<HTMLButtonElement>("#cancel")!.onclick = () => {
    invalidate();
    processor.cancel();
    setStep("corners-second");
  };
}
async function compare() {
  invalidate();
  const token = generation;
  setStep("processing");
  try {
    const output = await processor.run(
      slots[0]!,
      slots[1]!,
      sensitivity,
      (message) => {
        if (token === generation)
          document.querySelector("#progress")!.textContent = message;
      },
    );
    if (token !== generation) return;
    result = output;
    setStep("result");
  } catch (e) {
    if (token !== generation) return;
    setStep("corners-second");
    alertError(e);
  }
}
function renderResult() {
  if (!result) {
    setStep("corners-second");
    return;
  }
  content().innerHTML = `<div class="section-heading"><p class="eyebrow">比較結果</p><h1 tabindex="-1">違いの候補を確認</h1><p id="result-status" role="status">${result.regions ? `${result.regions}か所の差分候補が見つかりました。` : "現在の感度で差分候補は見つかりませんでした。"}</p></div>${result.warning ? `<aside class="warning">${escape(result.warning)}</aside>` : ""}<div class="result-card"><div id="result-view"></div><div class="sensitivity"><div><label for="sensitivity">検出感度</label><button id="default-sensitivity" class="text-button">初期値に戻す</button></div><input id="sensitivity" type="range" min="0" max="100" value="${sensitivity}"><div class="range-labels"><span>大きな差だけ</span><output id="sensitivity-value">${sensitivity}</output><span>小さな差も</span></div><p class="hint">感度を上げると、撮影ノイズも表示されやすくなります。</p></div></div><div class="actions split"><button id="back" class="secondary">← 4隅を調整</button><button id="new" class="secondary">別の写真を選ぶ</button><button id="clear" class="text-button">すべてリセット</button></div>`;
  mountResult(document.querySelector("#result-view")!, result);
  const slider = document.querySelector<HTMLInputElement>("#sensitivity")!;
  const update = () => {
    sensitivity = Number(slider.value);
    document.querySelector("#sensitivity-value")!.textContent =
      String(sensitivity);
    clearTimeout(debounce);
    const token = ++generation;
    document.querySelector("#result-status")!.textContent =
      "感度を変更して再計算しています…";
    debounce = setTimeout(async () => {
      try {
        const updated = await processor.refine(sensitivity);
        if (token !== generation || step !== "result") return;
        result = updated;
        // Preserve the control focus while updating the image and result count.
        mountResult(document.querySelector("#result-view")!, updated);
        document.querySelector("#result-status")!.textContent = updated.regions
          ? `${updated.regions}か所の差分候補が見つかりました。`
          : "現在の感度で差分候補は見つかりませんでした。";
      } catch (e) {
        if (token === generation) {
          document.querySelector("#result-status")!.textContent =
            "再計算できませんでした。4隅の確認から再試行してください。";
          alertError(e);
        }
      }
    }, 150);
  };
  slider.oninput = update;
  document.querySelector<HTMLButtonElement>("#default-sensitivity")!.onclick =
    () => {
      slider.value = "50";
      update();
    };
  document.querySelector<HTMLButtonElement>("#back")!.onclick = () => {
    invalidate();
    setStep("corners-second");
  };
  document.querySelector<HTMLButtonElement>("#new")!.onclick = () => {
    invalidate();
    processor.cancel();
    setStep("input");
  };
  document.querySelector<HTMLButtonElement>("#clear")!.onclick = () => {
    invalidate();
    processor.cancel();
    slots.fill(undefined);
    sensitivity = 50;
    setStep("input");
  };
}
render();
