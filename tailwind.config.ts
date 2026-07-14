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
          50: "#f8f9fa",
          100: "#e9ecef",
          200: "#ced4da",
          300: "#adb5bd",
          400: "#6c757d",
          500: "#495057",
          600: "#343a40",
          700: "#272b30",
          800: "#1c2025",
          900: "#14171c",
          950: "#0d1014",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.25rem",
      },
      boxShadow: {
        soft: "0 1px 3px 0 rgb(0 0 0 / 0.04), 0 1px 2px -1px rgb(0 0 0 / 0.04)",
        card: "0 2px 8px -2px rgb(0 0 0 / 0.06), 0 1px 3px -1px rgb(0 0 0 / 0.04)",
        elevated: "0 4px 16px -4px rgb(0 0 0 / 0.08), 0 2px 6px -2px rgb(0 0 0 / 0.04)",
        modal: "0 20px 60px -12px rgb(0 0 0 / 0.15), 0 8px 24px -8px rgb(0 0 0 / 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
