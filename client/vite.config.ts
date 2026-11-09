import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Проксируем API на Fastify (порт 3000): клиент ходит по относительным
// путям, в dev они не должны уходить на SPA-fallback самого Vite.
const API_PATHS = ["/health", "/admin-events", "/slots", "/bookings"];

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    proxy: Object.fromEntries(
      API_PATHS.map((path) => [
        path,
        { target: "http://localhost:3000", changeOrigin: true },
      ]),
    ),
  },
});
