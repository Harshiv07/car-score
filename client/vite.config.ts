import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Pre-bundled so the first visit to a lazily loaded page doesn't make the
  // dev server discover a dependency mid-session and reload the tab.
  optimizeDeps: {
    include: ["gsap", "gsap/ScrollTrigger", "gsap/SplitText", "@gsap/react", "three"],
  },
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: process.env.VITE_API_URL ?? "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
