import type { Config } from "tailwindcss";

/**
 * Configuração do Tailwind para a Cotrim Irrigação Pro.
 * Paleta da identidade visual: verde (agrícola), cinza escuro e branco.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Verde institucional (irrigação / agricultura)
        brand: {
          50: "#eefbf2",
          100: "#d6f5e0",
          200: "#aeebc3",
          300: "#78dba0",
          400: "#41c478",
          500: "#1ea85b", // cor principal
          600: "#138647",
          700: "#116b3b",
          800: "#125532",
          900: "#0f462b",
        },
        // Cinza escuro do menu lateral e superfícies
        graphite: {
          700: "#2a2f36",
          800: "#1f242b",
          900: "#161a20",
          950: "#0f1217",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
