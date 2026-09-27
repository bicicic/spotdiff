import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { build } from "esbuild";

// Keep the exact npm-pinned distribution local, including its embedded WASM.
export default defineConfig({
  base: "./",
  build: { outDir: "docs", emptyOutDir: true },
  plugins: [
    {
      name: "local-opencv",
      configureServer(server) {
        // OpenCV's UMD build needs importScripts, unavailable in module workers.
        // Vite serves module workers during development, so bundle this entry as
        // a classic worker for dev too. Production uses Vite's IIFE worker build.
        server.middlewares.use(
          "/processing-worker.js",
          async (_req, res, next) => {
            try {
              const output = await build({
                entryPoints: ["src/image-processing/opencv.worker.ts"],
                bundle: true,
                write: false,
                format: "iife",
                target: "es2022",
              });
              res.setHeader("Content-Type", "text/javascript");
              res.end(output.outputFiles[0].text);
            } catch (error) {
              next(error);
            }
          },
        );
        server.middlewares.use("/opencv/opencv.js", (_req, res) => {
          res.setHeader("Content-Type", "text/javascript");
          res.end(
            readFileSync("node_modules/@techstark/opencv-js/dist/opencv.js"),
          );
        });
      },
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "opencv/opencv.js",
          source: readFileSync(
            "node_modules/@techstark/opencv-js/dist/opencv.js",
          ),
        });
        this.emitFile({
          type: "asset",
          fileName: "opencv/LICENSE",
          source: readFileSync("node_modules/@techstark/opencv-js/LICENSE"),
        });
      },
    },
  ],
});
