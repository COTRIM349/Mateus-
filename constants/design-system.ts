/**
 * Design System da Cotrim Irrigação Pro.
 *
 * Todos os tokens visuais estão centralizados aqui. Qualquer componente
 * ou página deve referenciar estes valores — nunca usar cores, fontes ou
 * espaçamentos hard-coded diretamente no JSX/CSS.
 *
 * Os tokens são consumidos tanto pelo tailwind.config.ts quanto pelos
 * componentes de UI.
 */

/* ========================================================================== */
/*  CORES                                                                     */
/* ========================================================================== */

export const colors = {
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
  status: {
    success: "#16a34a",
    warning: "#d97706",
    error: "#dc2626",
    info: "#2563eb",
  },
  operational: {
    irrigando: { bg: "#d6f5e0", text: "#116b3b" },
    parado: { bg: "#f3f4f6", text: "#4b5563" },
    manutencao: { bg: "#fef3c7", text: "#92400e" },
    alerta: { bg: "#fee2e2", text: "#991b1b" },
  },
  priority: {
    alta: { bg: "#fee2e2", text: "#991b1b" },
    media: { bg: "#fef3c7", text: "#92400e" },
    baixa: { bg: "#f3f4f6", text: "#4b5563" },
  },
  chart: [
    "#1ea85b",
    "#41c478",
    "#116b3b",
    "#138647",
    "#78dba0",
    "#0f462b",
    "#aeebc3",
    "#d6f5e0",
  ],
} as const;

/* ========================================================================== */
/*  TIPOGRAFIA                                                                */
/* ========================================================================== */

export const typography = {
  fontFamily: {
    sans: '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif',
    mono: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
  },
  fontSize: {
    xs: "0.75rem",
    sm: "0.875rem",
    base: "1rem",
    lg: "1.125rem",
    xl: "1.25rem",
    "2xl": "1.5rem",
    "3xl": "1.875rem",
    "4xl": "2.25rem",
  },
  fontWeight: {
    normal: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
  },
  lineHeight: {
    tight: "1.25",
    normal: "1.5",
    relaxed: "1.625",
  },
} as const;

/* ========================================================================== */
/*  ESPAÇAMENTOS                                                              */
/* ========================================================================== */

export const spacing = {
  px: "1px",
  0: "0",
  0.5: "0.125rem",
  1: "0.25rem",
  1.5: "0.375rem",
  2: "0.5rem",
  2.5: "0.625rem",
  3: "0.75rem",
  4: "1rem",
  5: "1.25rem",
  6: "1.5rem",
  8: "2rem",
  10: "2.5rem",
  12: "3rem",
  16: "4rem",
  20: "5rem",
  24: "6rem",
} as const;

/* ========================================================================== */
/*  BORDAS E SOMBRAS                                                          */
/* ========================================================================== */

export const borderRadius = {
  none: "0",
  sm: "0.25rem",
  md: "0.375rem",
  lg: "0.5rem",
  xl: "0.75rem",
  "2xl": "1rem",
  full: "9999px",
} as const;

export const shadows = {
  none: "none",
  sm: "0 1px 2px rgba(0, 0, 0, 0.05)",
  md: "0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05)",
  lg: "0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.05)",
  xl: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)",
  card: "0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)",
  dropdown: "0 4px 16px rgba(0, 0, 0, 0.12)",
} as const;

/* ========================================================================== */
/*  ANIMAÇÕES                                                                 */
/* ========================================================================== */

export const animation = {
  duration: {
    fast: "100ms",
    normal: "200ms",
    slow: "300ms",
    slower: "500ms",
  },
  easing: {
    default: "cubic-bezier(0.4, 0, 0.2, 1)",
    in: "cubic-bezier(0.4, 0, 1, 1)",
    out: "cubic-bezier(0, 0, 0.2, 1)",
    inOut: "cubic-bezier(0.4, 0, 0.2, 1)",
  },
} as const;

/* ========================================================================== */
/*  LAYOUT                                                                    */
/* ========================================================================== */

export const layout = {
  sidebar: {
    width: "16rem",
    collapsedWidth: "4.5rem",
  },
  topbar: {
    height: "4rem",
  },
  content: {
    maxWidth: "96rem",
    paddingX: {
      sm: "1rem",
      md: "1.5rem",
      lg: "2rem",
    },
    paddingY: "1.5rem",
  },
} as const;

/* ========================================================================== */
/*  BREAKPOINTS                                                               */
/* ========================================================================== */

export const breakpoints = {
  sm: "640px",
  md: "768px",
  lg: "1024px",
  xl: "1280px",
  "2xl": "1536px",
} as const;

/* ========================================================================== */
/*  Z-INDEX                                                                   */
/* ========================================================================== */

export const zIndex = {
  base: 0,
  dropdown: 10,
  sticky: 20,
  topbar: 30,
  overlay: 40,
  sidebar: 50,
  modal: 60,
  popover: 70,
  toast: 80,
} as const;
