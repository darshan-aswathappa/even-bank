import { defineConfig } from "vite";

// Dev-only proxy: the app calls "/api/*" (same origin as the dev server), and
// Vite forwards those to the backend — so there are no CORS issues in dev.
// In a packaged build the app calls the real backend origin directly, which
// must be whitelisted in app.json and send CORS headers.
export default defineConfig({
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
});
