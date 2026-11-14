import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const target = process.env.AIMO_API ?? "http://127.0.0.1:8787";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: "127.0.0.1",
    proxy: {
      "/api": { target, changeOrigin: true },
      "/gateway": { target, changeOrigin: true },
      "/openapi.json": { target, changeOrigin: true },
    },
  },
  build: { outDir: "dist", sourcemap: true },
});
