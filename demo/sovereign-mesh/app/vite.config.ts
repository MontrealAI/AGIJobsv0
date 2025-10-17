import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5178,
    proxy: {
      "/mesh": {
        target: "http://localhost:8084",
        changeOrigin: true
      }
    }
  },
  preview: {
    port: 5178
  },
  base: "./"
});
