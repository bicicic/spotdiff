# 全体設計

## 構成と公開

Vite＋TypeScriptによる単一ページ。UIはDOMとCanvas、重い処理はclassic Web Workerで実行する。サーバーAPI、ルーター、外部CDNは使用しない。

```text
spotdiff/
├── design/                   設計資料
├── src/
│   ├── app/state.ts          戻る操作の状態遷移
│   ├── ui/                   画像入力、回転、4隅編集、プレビュー、結果
│   ├── image-processing/     geometry、thresholds、Workerとクライアント
│   ├── main.ts               画面・状態と各モジュールを接続
│   ├── types.ts              共有型
│   └── styles.css
├── public/.nojekyll
├── tests/
│   ├── unit/
│   └── e2e/
├── docs/                     自動生成、GitHub Pages公開用
│   ├── index.html
│   ├── .nojekyll
│   ├── assets/               JS、CSS、Worker
│   └── opencv/               WASM内蔵JSとライセンス
├── index.html
├── package.json
├── package-lock.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── playwright.config.ts
└── README.md
```

Viteの`base: './'`と`outDir: 'docs'`でリポジトリのサブパスから配信可能にする。OpenCVのURLはページのbase URIから絶対URLを作りWorkerに渡す。Workerの場所を基準に相対解決しない。

OpenCVはnpm固定版4.12.0をViteプラグインで開発時に配信し、ビルド時に`docs/opencv/`へコピーする。WASM内蔵ビルドなので独立WASMは生成しない。静的原本を二重管理しない。

OpenCV読込はclassic Workerの`importScripts`を使用する。Vite開発時の標準Workerはmodule形式になるため、開発サーバーではesbuildで同じWorkerソースをIIFE化して配信する。本番ではViteのWorkerビルドを使用する。

## データフロー

```text
File → デコード・縮小 → ImageSlot（ImageData＋正規化4点）
     → 4隅編集・プレビュー → Workerへ2枚送信
     → 射影補正 → 微小位置合わせ → 撮影差補正 → 差分スコア
     → 閾値・領域抽出 → ProcessingResult → Canvas表示
感度変更 → Worker内のスコアを再利用 → 閾値・領域抽出
```

画像と結果はメモリだけに置く。Object URLはデコード終了後に破棄。Worker内のOpenCVオブジェクトは各処理の`finally`で解放し、感度変更用にはJavaScriptの配列だけを保持する。

## メッセージと中断

`load(url)`で初期化し`ready`を返す。`analyze(id, first, second, options)`は全解析、`refine(id, options)`はキャッシュから領域を再抽出する。応答は`progress`、`result`、`error`。

同期WASM処理中はWorker内で中断メッセージを受信できないため、中断はWorker自体を`terminate()`し、次回作り直す。UIの世代番号で戻る・再試行後の古い応答を破棄する。初期化には60秒のタイムアウトを設ける。

OpenCV配布版の`then`は自身を返すEmscriptenのthenableであるため直接`await`しない。初期化コールバックから値なしのPromiseを解決して待機する。
