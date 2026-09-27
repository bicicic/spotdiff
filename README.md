# spotdiff — 写真で間違い探し

2枚の写真の4隅を指定し、傾き・遠近感・明るさを補正して差分候補をヒートマップで表示するブラウザアプリです。画像処理は端末内のOpenCV.jsで実行し、画像を送信・永続保存しません。

## 開発

Node.js 22.12以降を使用します。

```sh
npm ci
npm run dev
npm test
npm run build
npx playwright install chromium webkit
npm run test:e2e
```

Linuxでブラウザの共有ライブラリが不足する場合は`npx playwright install-deps chromium webkit`も必要です。開発サーバーの動作は`SPOTDIFF_DEV=1 npm run test:e2e -- --project=chromium`で検証できます。

`npm run preview`で生成済みの公開ファイルを確認できます。画像の読込はHTTPサーバー経由で行ってください。`file://`による直接起動には対応しません。

## GitHub Pages

1. `npm run build`を実行する。
2. ソースと生成された`docs/`を同じコミットに含め、GitHubへpushする。
3. リポジトリのSettings → Pages → Build and deploymentで「Deploy from a branch」、公開ブランチの`/docs`を選択する（基本は`main`）。

`docs/`はビルド時に置き換わるため直接編集しません。公開に必要なOpenCV.js、内蔵WASM、Worker、CSSはすべて含まれます。外部CDN・API・フォントに依存しません。GitHub側の公開設定・pushはこの実装作業には含みません。

## 構成

```text
design/                  設計資料（ビルドでは変更されない）
src/
  app/                   画面遷移
  ui/                    入力・4隅調整・補正プレビュー・結果表示
  image-processing/      OpenCV Worker、位置合わせ、差分、感度
  main.ts                UIと処理の接続
  types.ts               共有データ型・Workerメッセージ
  styles.css             スマホ優先のスタイル
public/.nojekyll          公開先へコピーする静的ファイル
tests/unit/              幾何・閾値・状態遷移テスト
tests/e2e/               実際のOpenCVを使うブラウザテスト
docs/                    GitHub Pages用ビルド成果物（コミット対象）
```

設計の入口は[design/README.md](design/README.md)、利用者向けの決定事項は[外部仕様](design/external-spec.md)です。

## 制限

- 絵・印刷物向け。大きな視差、強い影・反射、湾曲、微小な点・細線の検出精度は保証しません。
- 全体の色かぶりは補正するため、画面全体の色変更は検出対象外です。
- 入力上限は1枚10MiB（画面では10MB表記）、2,400万画素。処理画像の長辺は最大1600pxです。
- 実際のiPhone/Androidカメラの起動、実写の検出精度、指定実機での10秒目標は別途実機で受入確認が必要です。

## OpenCV配布について

`@techstark/opencv-js@4.12.0-release.1`を固定し、ビルド時に`docs/opencv/opencv.js`とライセンスを生成します。この配布形態はWASM内蔵なので、独立した`.wasm`ファイルはありません。計画時の4.14.0は公式配布先が取得時に403となったため、取得可能な4系の固定版へ変更しています。npmパッケージのライセンスに加え、[OpenCV本体のライセンス](https://github.com/opencv/opencv/blob/4.12.0/LICENSE)も参照してください。
