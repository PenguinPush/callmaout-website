// Copied from the callmaout extension by scripts/sync-extension.mjs. Edit it there, then run `npm run sync`.
declare module "gifenc" {
  export function quantize(rgba: Uint8Array, colors: number, options?: { format: "rgb565" | "rgb444" }): number[][];
  export function applyPalette(rgba: Uint8Array, palette: number[][], format?: "rgb565" | "rgb444"): Uint8Array;
  export function GIFEncoder(): {
    writeFrame(pixels: Uint8Array, width: number, height: number, options: { palette?: number[][]; delay?: number; repeat?: number; dispose?: number; transparent?: boolean; transparentIndex?: number }): void;
    finish(): void;
    bytes(): Uint8Array<ArrayBuffer>;
  };
}
