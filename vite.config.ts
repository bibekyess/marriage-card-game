import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "src/client",
  publicDir: "../../public",
  plugins: [react()],
  build: { outDir: "../../dist/client", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { "/socket.io": { target: "http://localhost:3000", ws: true }, "/api": "http://localhost:3000" },
  },
  test: { root: ".", include: ["tests/**/*.test.ts"] },
} as any);
