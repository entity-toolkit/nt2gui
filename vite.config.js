import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Flask port for `npm run dev`; the client reaches it through the proxy below.
const DEV_SERVER = `http://127.0.0.1:${process.env.NT2GUI_DEV_PORT ?? 5000}`;

export default defineConfig({
  root: "client",
  // Relative asset URLs, so the bundled client works under any path prefix.
  base: "./",
  plugins: [react()],
  server: {
    proxy: { "/api": DEV_SERVER },
  },
  build: {
    // Bundled into the Python package and served by Flask.
    outDir: "../nt2gui/static",
    emptyOutDir: true,
  },
  include: ["src/**/*", "global.d.ts"],
});
