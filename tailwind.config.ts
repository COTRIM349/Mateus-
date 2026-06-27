import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./modules/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eefbf2",
          100: "#d6f5e0",
          200: "#aeebc3",
          300: "#78dba0",
          400: "#41c478",
          500: "#1ea85b",
          600: "#138647",
          700: "#116b3b",
          800: "#125532",
          900: "#0f462b",
        },
        graphite: {
          50: "#f6f7f8",
          100: "#e1e3e6",
          200: "#c3c7cd",
          300: "#9da3ac",
          400: "#6b7280",
          500: "#4b5563",
          600: "#374151",
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
