import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the built game works from any folder or sub-path.
export default defineConfig({
  base: "./",
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
