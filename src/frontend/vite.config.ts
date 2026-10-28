import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Porta do backend: 8000 por padrão; use API_PORT quando ela estiver ocupada por outro projeto.
const apiPort = process.env.API_PORT ?? "8000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": `http://127.0.0.1:${apiPort}` },
  },
});
