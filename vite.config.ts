import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// A static site: `npm run build` writes dist/, which can be hosted anywhere.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
});
