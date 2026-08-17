import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../public",
    emptyOutDir: true,
  },
  server: {
    port: 5399,
    proxy: {
      "/api": "http://127.0.0.1:4399",
    },
  },
});
