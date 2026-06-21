import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Magnet Marbles web build. Static SPA, deployed to Render as a static site.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    target: "es2020",
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three"],
          r3f: ["@react-three/fiber", "@react-three/drei"],
        },
      },
    },
  },
  server: { host: true, port: 5173 },
});
