import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

const questApiRoutes = new Set([
  "GET /api/status",
  "GET /api/gesture-pick/status",
  "GET /api/gesture-pick/detections",
  "GET /api/cameras/stream",
  "POST /api/gesture-pick/select",
  "POST /api/gesture-pick/confirm",
  "POST /api/gesture-pick/cancel",
]);

export default defineConfig({
  plugins: [basicSsl()],
  server: {
    host: "0.0.0.0",
    port: 8081,
    strictPort: true,
    https: true,
    cors: false,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        // false makes Vite reject before forwarding to the loopback dashboard.
        bypass(request) {
          const path = (request.url ?? "").split("?")[0];
          return questApiRoutes.has(request.method + " " + path) ? undefined : false;
        },
      },
      "/ws": {
        target: "ws://127.0.0.1:8765",
        ws: true,
      },
    },
  },
});
