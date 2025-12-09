import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "client",
  plugins: [react()],
  build: {
    outDir: "../client/dist",
    emptyOutDir: true,
  },
  include: ["src/**/*", "global.d.ts" ],
});
