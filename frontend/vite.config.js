import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// When deploying to GitHub Pages, the app lives at /repo-name/
// Set VITE_BASE_PATH in your GitHub Actions environment or .env
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || "/",
});
