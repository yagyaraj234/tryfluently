import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), tanstackStart(), react()],
  // Rime calls' WebSockets go straight to the API, as Caddy does in production (ADR 0005).
  server: { port: 3001, proxy: { "/api/realtime": { target: "http://localhost:3000", ws: true } } },
});
