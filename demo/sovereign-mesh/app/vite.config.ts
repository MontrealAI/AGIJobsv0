import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5178,
    host: "0.0.0.0"
  },
  base: "./"
});
