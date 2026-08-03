import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const API_PORT = 3000;

export default defineConfig({
  plugins: [tanstackRouter({ target: "react" }), react(), tailwindcss()],
  server: {
    // Production serves the SPA and /api from one origin. The proxy keeps
    // development on one origin too, so no CORS anywhere.
    proxy: {
      "/api": `http://localhost:${API_PORT}`,
    },
  },
});
