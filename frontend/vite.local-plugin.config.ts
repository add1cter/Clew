import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { outDir: "local-plugin-dist", emptyOutDir: true, cssCodeSplit: false,
    rollupOptions: { input: "local-plugin.html", output: { inlineDynamicImports: true } } },
});
