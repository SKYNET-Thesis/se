import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

export default defineConfig({
  plugins: [basicSsl()],
  server: {
    host: "0.0.0.0",
    port: 8081,
    strictPort: true,
    https: true,
    proxy: {
      "/ws": {
        target: "ws://127.0.0.1:8765",
        ws: true,
      },
    },
  },
});
