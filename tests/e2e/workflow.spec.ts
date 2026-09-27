import { test, expect, type Page } from "@playwright/test";

async function fixture(
  page: Page,
  changed: boolean | "removed",
  brightness = 1,
  noise = false,
) {
  const data = await page.evaluate(
    ({ changed, brightness, noise }) => {
      const c = document.createElement("canvas");
      c.width = 480;
      c.height = 360;
      const x = c.getContext("2d")!;
      x.fillStyle = "#eeeecc";
      x.fillRect(0, 0, 480, 360);
      for (let i = 0; i < 30; i++) {
        x.fillStyle = ["#265747", "#799c54", "#ac673c", "#3a638e"][i % 4];
        const px = 25 + ((i * 83) % 430),
          py = 20 + ((i * 53) % 310);
        x.fillRect(px, py, 12 + (i % 17), 9 + (i % 13));
        x.font = "12px sans-serif";
        x.fillText(String(i), px, py + 30);
      }
      x.fillStyle =
        changed === "removed" ? "#eeeecc" : changed ? "#e12848" : "#285aba";
      x.fillRect(160, 120, 45, 45);
      if (brightness !== 1) {
        const im = x.getImageData(0, 0, 480, 360);
        for (let i = 0; i < im.data.length; i++)
          if (i % 4 !== 3) im.data[i] *= brightness;
        x.putImageData(im, 0, 0);
      }
      if (noise) {
        const im = x.getImageData(0, 0, 480, 360);
        let seed = 17;
        for (let i = 0; i < im.data.length; i++)
          if (i % 4 !== 3) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            im.data[i] += (seed % 7) - 3;
          }
        x.putImageData(im, 0, 0);
      }
      return c.toDataURL("image/png").split(",")[1];
    },
    { changed, brightness, noise },
  );
  return {
    name: changed ? "changed.png" : "original.png",
    mimeType: "image/png",
    buffer: Buffer.from(data, "base64"),
  };
}
async function loadPair(
  page: Page,
  changed: boolean | "removed" = true,
  brightness = 1,
) {
  await page
    .getByLabel("1枚目の画像を選択", { exact: true })
    .setInputFiles(await fixture(page, false));
  await expect(page.getByText("選択済み", { exact: true })).toHaveCount(1);
  await page
    .getByLabel("2枚目の画像を選択", { exact: true })
    .setInputFiles(await fixture(page, changed, brightness));
  await expect(page.getByText("選択済み", { exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "4隅を合わせる" }).click();
  await page.getByRole("button", { name: "2枚目の4隅へ" }).click();
}

test("画像選択、補正、OpenCV比較、感度変更、やり直し", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const external: string[] = [];
  page.on("request", (req) => {
    if (
      /^https?:/.test(req.url()) &&
      !req.url().startsWith("http://127.0.0.1:4173")
    )
      external.push(req.url());
  });
  await page.goto("./");
  await page.screenshot({
    path: testInfo.outputPath("input.png"),
    fullPage: true,
  });
  await loadPair(page);
  await page.getByRole("button", { name: "補正して比較する" }).click();
  await expect(
    page.getByRole("heading", { name: "違いの候補を確認" }),
  ).toBeVisible({ timeout: 60000 });
  await expect(page.locator("#result-status")).toHaveText(
    "1か所の差分候補が見つかりました。",
  );
  await expect(page.locator(".warning")).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("result.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "2枚目", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "2枚目", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.locator("#zoom").fill("170");
  await page.locator("#opacity").fill("40");
  await page.getByLabel("検出感度", { exact: true }).fill("80");
  await expect(page.locator("#sensitivity-value")).toHaveText("80");
  await expect(page.locator("#result-status")).toContainText("か所の差分候補");
  await expect(
    page.getByRole("button", { name: "2枚目", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#zoom")).toHaveValue("170");
  await expect(page.locator("#opacity")).toHaveValue("40");
  await page.getByRole("button", { name: "初期値に戻す" }).click();
  await expect(page.locator("#sensitivity-value")).toHaveText("50");
  await page.getByRole("button", { name: "4隅を調整" }).click();
  await expect(
    page.getByRole("heading", { name: "絵の4隅を合わせる" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "補正して比較する" }).click();
  await expect(
    page.getByRole("heading", { name: "違いの候補を確認" }),
  ).toBeVisible({ timeout: 60000 });
  await page.getByRole("button", { name: "すべてリセット" }).click();
  await expect(
    page.getByRole("button", { name: "4隅を合わせる" }),
  ).toBeDisabled();
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test("同じ画像では差分候補なし", async ({ page }) => {
  await page.goto("./");
  await loadPair(page, false);
  await page.getByRole("button", { name: "補正して比較する" }).click();
  await expect(page.locator("#result-status")).toContainText(
    "差分候補は見つかりませんでした",
    { timeout: 60000 },
  );
});

test("物の削除を差分として検出する", async ({ page }) => {
  await page.goto("./");
  await loadPair(page, "removed");
  await page.getByRole("button", { name: "補正して比較する" }).click();
  await expect(
    page.getByRole("heading", { name: "違いの候補を確認" }),
  ).toBeVisible({ timeout: 60000 });
  await expect(page.locator("#result-status")).toHaveText(
    "1か所の差分候補が見つかりました。",
  );
});

test("明るさだけの違いを補正する", async ({ page }) => {
  await page.goto("./");
  await loadPair(page, false, 0.85);
  await page.getByRole("button", { name: "補正して比較する" }).click();
  await expect(page.locator("#result-status")).toContainText(
    "差分候補は見つかりませんでした",
    { timeout: 60000 },
  );
});

test("中断して入力を保持し、再比較できる", async ({ page }) => {
  await page.goto("./");
  await loadPair(page);
  await page.getByRole("button", { name: "補正して比較する" }).click();
  await page.getByRole("button", { name: "中断して4隅に戻る" }).click();
  await expect(
    page.getByRole("heading", { name: "絵の4隅を合わせる" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "補正して比較する" }).click();
  await expect(
    page.getByRole("heading", { name: "違いの候補を確認" }),
  ).toBeVisible({ timeout: 60000 });
});

test("壊れた画像は復帰可能なエラーを表示する", async ({ page }) => {
  await page.goto("./");
  await page.getByLabel("1枚目の画像を選択", { exact: true }).setInputFiles({
    name: "broken.png",
    mimeType: "image/png",
    buffer: Buffer.from("broken"),
  });
  await expect(page.getByRole("alert")).toContainText("読み込めません");
  await expect(
    page.getByRole("button", { name: "4隅を合わせる" }),
  ).toBeDisabled();
  await loadPair(page);
  await expect(
    page.getByRole("heading", { name: "絵の4隅を合わせる" }),
  ).toBeVisible();
});

test("4隅のドラッグ、無効領域、リセット、回転、キーボード操作", async ({
  page,
}) => {
  await page.goto("./");
  await loadPair(page);
  const canvas = page.locator(".corner-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const rect = (await canvas.boundingBox())!;
  await page.mouse.move(
    rect.x + rect.width * 0.05,
    rect.y + rect.height * 0.05,
  );
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * 0.99, rect.y + rect.height * 0.8);
  await expect(page.locator(".loupe")).toBeVisible();
  await page.mouse.up();
  await expect(page.locator("#quad-error")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "補正して比較する" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "4隅を戻す", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "補正して比較する" }),
  ).toBeEnabled();
  const dimensions = await canvas.evaluate((el) => [
    (el as HTMLCanvasElement).width,
    (el as HTMLCanvasElement).height,
  ]);
  await page.getByRole("button", { name: "90°回転" }).click();
  expect(
    await canvas.evaluate((el) => [
      (el as HTMLCanvasElement).width,
      (el as HTMLCanvasElement).height,
    ]),
  ).toEqual(dimensions.reverse());
  await page.getByRole("button", { name: "1 左上", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("button", { name: "補正して比較する" }),
  ).toBeEnabled();
});

test("画像外の余白からつかみ、境界外でもドラッグを継続できる", async ({ page }) => {
  await page.goto("./");
  await loadPair(page);
  const canvas = page.locator(".corner-canvas");
  const stage = page.locator(".editor-stage");
  await stage.scrollIntoViewIfNeeded();
  const rect = (await canvas.boundingBox())!;
  await stage.evaluate(el => el.addEventListener("pointerdown", event => {
    el.setAttribute("data-test-pointer", String((event as PointerEvent).pointerId));
  }, { once: true }));
  await page.mouse.move(rect.x - 8, rect.y + rect.height * .05);
  await page.mouse.down();
  await expect(page.locator(".loupe")).toBeVisible();
  const edge = await canvas.evaluate(el => (el as HTMLCanvasElement).toDataURL());
  await page.mouse.move(rect.x - 35, rect.y + rect.height * .05);
  await expect(page.locator(".loupe")).toBeVisible();
  expect(await canvas.evaluate(el => (el as HTMLCanvasElement).toDataURL())).toBe(edge);
  // Losing capture alone must not end the drag; window tracking still works.
  await stage.evaluate(el => el.releasePointerCapture(Number(el.getAttribute("data-test-pointer"))));
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 999, clientX: 0, clientY: 0 }));
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 999 }));
  });
  await expect(page.locator(".loupe")).toBeVisible();
  expect(await canvas.evaluate(el => (el as HTMLCanvasElement).toDataURL())).toBe(edge);
  await page.mouse.move(rect.x + rect.width * .15, rect.y + rect.height * .15);
  expect(await canvas.evaluate(el => (el as HTMLCanvasElement).toDataURL())).not.toBe(edge);
  await page.mouse.up();
  await expect(page.locator(".loupe")).toBeHidden();
  await expect(page.locator("#quad-error")).toBeHidden();
  const finished = await canvas.evaluate(el => (el as HTMLCanvasElement).toDataURL());
  await page.mouse.move(rect.x + rect.width * .3, rect.y + rect.height * .3);
  expect(await canvas.evaluate(el => (el as HTMLCanvasElement).toDataURL())).toBe(finished);
});

test("タッチ操作でも余白と画像外を移動でき、ページがスクロールしない", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "CDPの実タッチ入力はChromiumで検証する");
  await page.setViewportSize({ width: 390, height: 844 });
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  await page.goto("./");
  await loadPair(page);
  await page.locator(".editor-stage").scrollIntoViewIfNeeded();
  const rect = (await page.locator(".corner-canvas").boundingBox())!;
  const scroll = await page.evaluate(() => window.scrollY);
  const touch = async (type: "touchStart" | "touchMove", x: number, y: number) => {
    await session.send("Input.dispatchTouchEvent", { type, touchPoints: [{ x, y, id: 1 }] });
  };
  await touch("touchStart", rect.x - 8, rect.y + rect.height * .05);
  await touch("touchMove", rect.x - 35, rect.y + rect.height * .2);
  await expect(page.locator(".loupe")).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(scroll);
  await touch("touchMove", rect.x + rect.width * .1, rect.y + rect.height * .1);
  await expect(page.locator(".loupe")).toBeVisible();
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.locator(".loupe")).toBeHidden();
  await expect(page.locator("#quad-error")).toBeHidden();
  await session.detach();
});

test("10MBを超えるファイルを拒否する", async ({ page }) => {
  await page.goto("./");
  await page.getByLabel("1枚目の画像を選択", { exact: true }).setInputFiles({
    name: "large.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
  });
  await expect(page.getByRole("alert")).toContainText("10MB以下");
  await expect(
    page.getByRole("button", { name: "4隅を合わせる" }),
  ).toBeDisabled();
});

test("傾き・縮小・ノイズがある同じ絵を4点補正して比較する", async ({
  page,
}, testInfo) => {
  await page.goto("./");
  const first = await fixture(page, false);
  const noisy = await fixture(page, false, 1, true);
  const transformed = await page.evaluate(async (base64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${base64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = 480;
    c.height = 360;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 480, 360);
    ctx.setTransform(0.82, 0.025, -0.04, 0.82, 45, 25);
    ctx.drawImage(img, 0, 0);
    return c.toDataURL("image/png").split(",")[1];
  }, noisy.buffer.toString("base64"));
  await page
    .getByLabel("1枚目の画像を選択", { exact: true })
    .setInputFiles(first);
  await expect(page.getByText("選択済み", { exact: true })).toHaveCount(1);
  await page.getByLabel("2枚目の画像を選択", { exact: true }).setInputFiles({
    name: "skewed.png",
    mimeType: "image/png",
    buffer: Buffer.from(transformed, "base64"),
  });
  await expect(page.getByText("選択済み", { exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "4隅を合わせる" }).click();
  await page.getByRole("button", { name: "2枚目の4隅へ" }).click();
  await page.locator(".corner-canvas").scrollIntoViewIfNeeded();
  const rect = (await page.locator(".corner-canvas").boundingBox())!;
  for (const [u, v] of [
    [0.05, 0.05],
    [0.95, 0.05],
    [0.95, 0.95],
    [0.05, 0.95],
  ]) {
    const x = u * 479,
      y = v * 359;
    await page.mouse.move(rect.x + u * rect.width, rect.y + v * rect.height);
    await page.mouse.down();
    await page.mouse.move(
      rect.x + ((0.82 * x - 0.04 * y + 45) / 479) * rect.width,
      rect.y + ((0.025 * x + 0.82 * y + 25) / 359) * rect.height,
    );
    await page.mouse.up();
  }
  await page.getByRole("button", { name: "補正して比較する" }).click();
  await expect(
    page.getByRole("heading", { name: "違いの候補を確認" }),
  ).toBeVisible({ timeout: 60000 });
  await page.screenshot({
    path: testInfo.outputPath("skew-result.png"),
    fullPage: true,
  });
  await expect(page.locator("#result-status")).toContainText(
    "差分候補は見つかりませんでした",
  );
});
