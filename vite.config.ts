import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: "src/client",
  publicDir: "../../public",
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src/client", import.meta.url)) } },
  build: { outDir: "../../dist/client", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { "/socket.io": { target: "http://localhost:3000", ws: true }, "/api": "http://localhost:3000" },
  },
  test: { root: ".", include: ["tests/**/*.test.ts"] },
} as any);
