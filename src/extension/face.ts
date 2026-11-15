// Copied from the callmaout extension by scripts/sync-extension.mjs. Edit it there, then run `npm run sync`.
import { asset } from "../asset";
// Both models warm with the camera so capture can label the photo before encoding.
// Finds the face in a photo, normalizes it the same way scripts/train_smile.py normalized
// the FEI Face Database, and scores it with the smile model trained there.
import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";
import * as ort from "onnxruntime-web/wasm";
import spec from "./face-spec.json";
import type { FaceResult } from "./messages";

const { size } = spec;

let detectorLoading: Promise<FaceDetector> | null = null;
let sessionLoading: Promise<ort.InferenceSession> | null = null;

// Detection is also used during capture; don't wait for the smile model there.
export function loadFaceDetector() {
  if (detectorLoading) return detectorLoading;
  const load = (async () => {
    const files = await FilesetResolver.forVisionTasks(asset("mediapipe"));
    return FaceDetector.createFromOptions(files, {
      baseOptions: { modelAssetPath: asset("models/blaze_face_short_range.tflite") },
      runningMode: "IMAGE",
    });
  })();
  detectorLoading = load;
  load.catch(() => detectorLoading === load && (detectorLoading = null));
  return load;
}

export async function loadFace() {
  if (!sessionLoading) {
    // Extension pages aren't cross-origin isolated, so no worker threads.
    ort.env.wasm.numThreads = 1;
    const load = ort.InferenceSession.create(asset("models/smile.onnx"));
    sessionLoading = load;
    load.catch(() => sessionLoading === load && (sessionLoading = null));
  }
  const [detector, session] = await Promise.all([loadFaceDetector(), sessionLoading]);
  return { detector, session };
}

const crop = document.createElement("canvas");
crop.width = crop.height = size;
const ctx = crop.getContext("2d", { willReadFrequently: true })!;

// The smile watcher and photo checks share one crop canvas and one ONNX session, so they take turns.
let queue: Promise<unknown> = Promise.resolve();

export function analyzeFace(image: HTMLCanvasElement): Promise<FaceResult> {
  const run = queue.then(() => analyzeNow(image));
  queue = run.catch(() => {});
  return run;
}

async function analyzeNow(image: HTMLCanvasElement): Promise<FaceResult> {
  const { detector, session } = await loadFace();
  const start = performance.now();
  const { width, height } = image;

  const faces = detector.detect(image).detections;
  if (!faces.length) return { face: false };
  const best = faces.reduce((a, b) => (b.categories[0].score > a.categories[0].score ? b : a));
  const [[x1, y1], [x2, y2]] = best.keypoints
    .slice(0, 2)
    .map((k) => [k.x * width, k.y * height])
    .sort((a, b) => a[0] - b[0]);

  // Similarity transform putting the eyes at the spec positions (same math as align() in train_smile.py).
  const [qx1, qx2, qy] = [spec.leftEyeX * size, spec.rightEyeX * size, spec.eyeY * size];
  const k = (qx2 - qx1) / Math.hypot(x2 - x1, y2 - y1);
  const theta = -Math.atan2(y2 - y1, x2 - x1);
  const a = k * Math.cos(theta);
  const b = k * Math.sin(theta);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  ctx.setTransform(a, b, -b, a, qx1 - (a * x1 - b * y1), qy - (b * x1 + a * y1));
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // Grayscale, histogram-equalize, standardize (same as to_tensor() in train_smile.py).
  const pixels = ctx.getImageData(0, 0, size, size);
  const n = size * size;
  const gray = new Uint8Array(n);
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    const [r, g, bl] = [pixels.data[i * 4], pixels.data[i * 4 + 1], pixels.data[i * 4 + 2]];
    gray[i] = Math.min(255, Math.max(0, Math.round(r * 0.299 + g * 0.587 + bl * 0.114)));
    hist[gray[i]]++;
  }
  const cdf = new Uint32Array(256);
  for (let v = 0, sum = 0; v < 256; v++) cdf[v] = sum += hist[v];
  const cdfMin = cdf.find((c) => c > 0)!;
  const denom = Math.max(n - cdfMin, 1);

  const input = new Float32Array(n);
  let mean = 0;
  for (let i = 0; i < n; i++) {
    input[i] = Math.round(((cdf[gray[i]] - cdfMin) / denom) * 255) / 255;
    mean += input[i];
  }
  mean /= n;
  let variance = 0;
  for (let i = 0; i < n; i++) variance += (input[i] - mean) ** 2;
  const std = Math.sqrt(variance / n) + 1e-6;

  // Draw the equalized face back so the settings page can show what the model saw.
  for (let i = 0; i < n; i++) {
    const v = input[i] * 255;
    pixels.data.set([v, v, v, 255], i * 4);
    input[i] = (input[i] - mean) / std;
  }
  ctx.putImageData(pixels, 0, 0);

  const output = await session.run({ input: new ort.Tensor("float32", input, [1, 1, size, size]) });
  const logit = (output.logit.data as Float32Array)[0];
  return {
    face: true,
    boxes: faces.flatMap(({ boundingBox }) => boundingBox ? [boundingBox] : []),
    smile: 1 / (1 + Math.exp(-logit)),
    ms: Math.round(performance.now() - start),
    crop: crop.toDataURL(),
  };
}
