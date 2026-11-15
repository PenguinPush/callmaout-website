// Pulls everything the site shares with the extension from a checkout of it (../callmaout by
// default, or CALLMAOUT_DIR): the face/sticker/GIF code, its models and artwork, and a fresh
// build of the extension zipped up as the download. Re-run after changing the extension.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const extension = resolve(process.env.CALLMAOUT_DIR ?? "../callmaout");
if (!existsSync(join(extension, "public/manifest.json"))) throw new Error(`No extension checkout at ${extension}`);

// Code: the same modules the extension's settings page uses for its preview and GIFs.
// (apology-preview.ts only because messages.ts imports a type from it.)
const modules = [
  "apology-preview.ts",
  "CameraPreview.tsx",
  "face.ts",
  "face-spec.json",
  "gif-client.ts",
  "gif-encoder.ts",
  "gif-transitions.ts",
  "gif.worker.ts",
  "gifenc.d.ts",
  "messages.ts",
  "photo-overlays.ts",
  "sticker-layout.ts",
  "sticker-randomizer.ts",
];
const header = "// Copied from the callmaout extension by scripts/sync-extension.mjs. Edit it there, then run `npm run sync`.\n";
rmSync("src/extension", { recursive: true, force: true });
mkdirSync("src/extension");
for (const name of modules) {
  let source = readFileSync(join(extension, "src/lib", name), "utf8");
  if (!name.endsWith(".json")) {
    // Extension asset URLs become plain URLs on the site.
    if (source.includes("chrome.runtime.getURL(")) {
      source = source.replaceAll("chrome.runtime.getURL(", "asset(");
      source = `import { asset } from "../asset";\n` + source;
    }
    source = header + source;
  }
  writeFileSync(join("src/extension", name), source);
}
writeFileSync("src/extension/styles.css", "/* Copied from the callmaout extension by scripts/sync-extension.mjs. */\n" + readFileSync(join(extension, "src/styles.css"), "utf8"));

// Models and artwork.
for (const dir of ["models", "photos"]) rmSync(join("public", dir), { recursive: true, force: true });
mkdirSync("public/models", { recursive: true });
for (const file of ["blaze_face_short_range.tflite", "smile.onnx", "smile.json"]) cpSync(join(extension, "public/models", file), join("public/models", file));
mkdirSync("public/photos", { recursive: true });
for (const file of readdirSync(join(extension, "public/photos"))) {
  if (/^(label|sticker)-/.test(file)) cpSync(join(extension, "public/photos", file), join("public/photos", file));
}

// The download: a fresh extension build, zipped.
console.log("Building the extension…");
execFileSync("npm", ["run", "build"], { cwd: extension, stdio: "inherit" });
rmSync("public/callmaout.zip", { force: true });
execFileSync("zip", ["-qr", resolve("public/callmaout.zip"), "."], { cwd: join(extension, "dist") });
const { version } = JSON.parse(readFileSync(join(extension, "public/manifest.json"), "utf8"));
writeFileSync("src/extension/version.json", JSON.stringify({ version }) + "\n");
console.log(`Synced from ${extension} (extension ${version}).`);
