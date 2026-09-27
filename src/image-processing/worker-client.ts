import workerUrl from "./opencv.worker?worker&url";
import type {
  ImageSlot,
  ProcessingResult,
  WorkerRequest,
  WorkerResponse,
} from "../types";
export class Processor {
  private worker?: Worker;
  private ready?: Promise<void>;
  private counter = 0;
  private initReject?: (e: Error) => void;
  private initTimer?: ReturnType<typeof setTimeout>;
  private pending = new Map<
    number,
    {
      resolve: (v: ProcessingResult) => void;
      reject: (e: Error) => void;
      progress: (s: string) => void;
    }
  >();
  cancel() {
    clearTimeout(this.initTimer);
    this.initReject?.(new DOMException("中断しました", "AbortError"));
    this.initReject = undefined;
    this.worker?.terminate();
    this.worker = undefined;
    this.ready = undefined;
    for (const p of this.pending.values())
      p.reject(new DOMException("中断しました", "AbortError"));
    this.pending.clear();
  }
  private start() {
    if (this.ready) return this.ready;
    const worker = new Worker(
      import.meta.env.DEV
        ? new URL("processing-worker.js", document.baseURI)
        : workerUrl,
    );
    this.worker = worker;
    this.ready = new Promise<void>((resolve, reject) => {
      this.initReject = reject;
      const timer = setTimeout(() => {
        reject(
          new Error(
            "画像処理の準備に時間がかかっています。再試行してください。",
          ),
        );
        this.cancel();
      }, 60000);
      this.initTimer = timer;
      worker.onerror = () => {
        clearTimeout(timer);
        const error = new Error(
          "画像処理を読み込めませんでした。ページを再読み込みしてください。",
        );
        reject(error);
        for (const p of this.pending.values()) p.reject(error);
        this.pending.clear();
        this.cancel();
      };
      worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
        if (data.type === "ready") {
          clearTimeout(timer);
          this.initReject = undefined;
          resolve();
        } else if (data.type === "error" && data.id === undefined) {
          clearTimeout(timer);
          reject(new Error(data.message));
          this.cancel();
        } else if ("id" in data && data.id !== undefined) {
          const p = this.pending.get(data.id);
          if (!p) return;
          if (data.type === "progress") p.progress(data.message);
          else {
            this.pending.delete(data.id);
            if (data.type === "result") p.resolve(data.result);
            else if (data.type === "error") p.reject(new Error(data.message));
          }
        }
      };
      worker.postMessage({
        type: "load",
        url: new URL(
          `${import.meta.env.BASE_URL}opencv/opencv.js`,
          document.baseURI,
        ).href,
      } satisfies WorkerRequest);
    });
    return this.ready;
  }
  async run(
    first: ImageSlot,
    second: ImageSlot,
    sensitivity: number,
    progress: (s: string) => void,
  ) {
    const id = ++this.counter;
    await this.start();
    return this.request(
      { type: "analyze", id, first, second, options: { sensitivity } },
      progress,
    );
  }
  async refine(sensitivity: number) {
    if (!this.worker) throw new Error("画像をもう一度比較してください。");
    return this.request(
      { type: "refine", id: ++this.counter, options: { sensitivity } },
      () => {},
    );
  }
  private request(
    message: Extract<WorkerRequest, { id: number }>,
    progress: (s: string) => void,
  ): Promise<ProcessingResult> {
    return new Promise((resolve, reject) => {
      this.pending.set(message.id, { resolve, reject, progress });
      this.worker!.postMessage(message);
    });
  }
}
