import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Alias "@/..." → raiz do projeto (mesmo mapeamento do tsconfig).
const root = fileURLToPath(new URL(".", import.meta.url)).replace(/\/$/, "");

export default defineConfig({
  resolve: {
    alias: { "@": root },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
});
