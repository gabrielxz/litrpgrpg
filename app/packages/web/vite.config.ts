import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development the API server runs on 8787 (`pnpm --filter @gradebreaker/server dev`);
// Vite forwards /api to it, the live WebSocket included. In production the server serves
// the built client itself.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://localhost:8787", ws: true } },
  },
});
