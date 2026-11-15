// Copied from the callmaout extension by scripts/sync-extension.mjs. Edit it there, then run `npm run sync`.
import { chooseTransitions, animationDuration, type Transition } from "./gif-transitions";

type Reply = { id: number; bytes?: Uint8Array<ArrayBuffer>; ms?: number; error?: string };
let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, { resolve: (value: Reply) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();

export function stopGifWorker() {
  worker?.terminate();
  worker = null;
  for (const job of pending.values()) { clearTimeout(job.timer); job.reject(new Error("GIF preparation cancelled")); }
  pending.clear();
}

function request(width: number, height: number, pixels?: ArrayBuffer, effect?: Transition, entrance?: Transition) {
  if (!worker) {
    worker = new Worker(new URL("./gif.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }: MessageEvent<Reply>) => {
      const job = pending.get(data.id);
      if (!job) return;
      pending.delete(data.id);
      clearTimeout(job.timer);
      if (data.error) job.reject(new Error(data.error));
      else job.resolve(data);
    };
    worker.onerror = () => stopGifWorker();
  }
  const id = ++nextId;
  return new Promise<Reply>((resolve, reject) => {
    const timer = setTimeout(() => stopGifWorker(), 15000);
    pending.set(id, { resolve, reject, timer });
    worker!.postMessage({ id, width, height, pixels, effect, entrance }, pixels ? [pixels] : []);
  });
}

export function warmGifWorker() { return request(480, 270); }

export async function encodeGif(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const { entrance, effect } = chooseTransitions();
  const reply = await request(canvas.width, canvas.height, pixels.data.buffer as ArrayBuffer, effect, entrance);
  if (!reply.bytes) throw new Error("GIF encoder returned no bytes");
  const blob = new Blob([reply.bytes], { type: "image/gif" });
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return { dataUrl, effect, entrance, durationMs: animationDuration(entrance, effect), encodeMs: reply.ms ?? 0 };
}
