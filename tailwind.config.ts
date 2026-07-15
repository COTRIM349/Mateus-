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
          700: "#232830",
          800: "#181c23",
          900: "#111518",
          950: "#0a0d10",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.25rem",
      },
      // Sombras em base slate (16 24 40) em vez de preto puro → aspecto mais
      // suave e premium, com escala de elevação consistente.
      boxShadow: {
        xs: "0 1px 2px 0 rgb(16 24 40 / 0.04)",
        soft: "0 1px 2px 0 rgb(16 24 40 / 0.05), 0 1px 3px -1px rgb(16 24 40 / 0.04)",
        card: "0 1px 2px 0 rgb(16 24 40 / 0.04), 0 6px 16px -6px rgb(16 24 40 / 0.08)",
        elevated: "0 8px 24px -8px rgb(16 24 40 / 0.12), 0 2px 6px -2px rgb(16 24 40 / 0.06)",
        modal: "0 24px 64px -16px rgb(16 24 40 / 0.28), 0 8px 24px -8px rgb(16 24 40 / 0.12)",
        glow: "0 0 0 1px rgb(30 168 91 / 0.18), 0 10px 28px -10px rgb(30 168 91 / 0.40)",
        // Elevação sutil para superfícies no modo escuro (realce interno + drop).
        "dark-card": "inset 0 1px 0 0 rgb(255 255 255 / 0.03), 0 8px 24px -14px rgb(0 0 0 / 0.7)",
        "dark-elevated": "inset 0 1px 0 0 rgb(255 255 255 / 0.05), 0 16px 40px -16px rgb(0 0 0 / 0.8)",
      },
      transitionTimingFunction: {
        premium: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
