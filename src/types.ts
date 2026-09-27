export interface Point {
  x: number;
  y: number;
}
export type Quad = [Point, Point, Point, Point];
export interface ImageSlot {
  name: string;
  pixels: ImageData;
  corners: Quad;
}
export type Step =
  | "input"
  | "corners-first"
  | "corners-second"
  | "processing"
  | "result";
export interface ProcessingOptions {
  sensitivity: number;
}
export interface ProcessingResult {
  width: number;
  height: number;
  first: Uint8ClampedArray;
  second: Uint8ClampedArray;
  heat: Uint8ClampedArray;
  regions: number;
  warning?: string;
}
export type WorkerRequest =
  | { type: "load"; url: string }
  | {
      type: "analyze";
      id: number;
      first: ImageSlot;
      second: ImageSlot;
      options: ProcessingOptions;
    }
  | { type: "refine"; id: number; options: ProcessingOptions };
export type WorkerResponse =
  | { type: "ready" }
  | { type: "progress"; id: number; message: string }
  | { type: "result"; id: number; result: ProcessingResult }
  | { type: "error"; id?: number; message: string };
