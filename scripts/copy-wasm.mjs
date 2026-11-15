// MediaPipe loads its WASM runtime by URL at runtime, so it's served as-is from public/mediapipe.
import { cpSync, mkdirSync } from "node:fs";

mkdirSync("public/mediapipe", { recursive: true });
for (const file of ["vision_wasm_internal.js", "vision_wasm_internal.wasm"]) {
  cpSync(`node_modules/@mediapipe/tasks-vision/wasm/${file}`, `public/mediapipe/${file}`);
}
