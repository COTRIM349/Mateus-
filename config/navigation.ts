export interface NavItem {
  label: string;
  href: string;
  icon: string;
}

export interface NavGroup {
  label: string;
  icon: string;
  items: NavItem[];
}

// ── Ícones (paths SVG re-utilizáveis) ─────────────────────────────────────
const ICON = {
  home: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  farm: "M3 21h18M5 21V7l8-4v18M19 21V11l-6-4",
  pivot: "M12 3v18m0-9a9 9 0 100 .001M12 12l6.36 6.36",
  soil: "M3 7h18M3 12h18M3 17h18",
  water: "M12 3l5 7a5 5 0 11-10 0l5-7z",
  crop: "M12 2v20m0 0c-4 0-7-3-7-7 3 0 5 1 7 4 2-3 4-4 7-4 0 4-3 7-7 7z",
  parcel: "M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244",
  cloud: "M3 15a4 4 0 014-4 5 5 0 019.9 1H17a3 3 0 010 6H6a3 3 0 01-3-3z",
  balance: "M12 3v18m0-12l-4 4m4-4l4 4M6 21h12",
  decision: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  schedule: "M8 7V3m8 4V3M3 11h18M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  boletim: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  os: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  sensor: "M12 2a10 10 0 100 20 10 10 0 000-20zm0 6v4l3 3",
  reservoir: "M5 4h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1zm-1 9c3 0 3 2 6 2s3-2 6-2 3 2 4 2",
  energy: "M13 2L3 14h7l-1 8 10-12h-7l1-8z",
  cost: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V6m0 12v-2m0-8c1.11 0 2.08.402 2.599 1M12 16c-1.11 0-2.08-.402-2.599-1",
  cashflow: "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z",
  report: "M9 17v-6m4 6V7m4 10v-3M4 19h16a1 1 0 001-1V6a1 1 0 00-1-1H4a1 1 0 00-1 1v12a1 1 0 001 1z",
  ai: "M12 3a4 4 0 014 4v1a4 4 0 010 8v1a4 4 0 01-8 0v-1a4 4 0 010-8V7a4 4 0 014-4zM9 12h.01M15 12h.01",
  alert: "M12 9v4m0 4h.01M10.29 3.86L1.82 18a1 1 0 00.86 1.5h18.64a1 1 0 00.86-1.5L13.71 3.86a1 1 0 00-1.72 0z",
  settings: "M12 9a3 3 0 100 6 3 3 0 000-6zm7.4 3a7.4 7.4 0 00-.1-1l2-1.6-2-3.5-2.4 1a7.3 7.3 0 00-1.7-1l-.4-2.6H9.2l-.4 2.6a7.3 7.3 0 00-1.7 1l-2.4-1-2 3.5 2 1.6a7.4 7.4 0 000 2l-2 1.6 2 3.5 2.4-1c.5.4 1.1.7 1.7 1l.4 2.6h5.6l.4-2.6c.6-.3 1.2-.6 1.7-1l2.4 1 2-3.5-2-1.6c.1-.3.1-.7.1-1z",
} as const;

// Menu só com telas que já operam. Rotas vazias (água, alertas, sensores,
// reservatórios, Cotrim AI, OS, chuva manual) ficam fora até existirem.

export const topLevelItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: ICON.home },
  { label: "Histórico", href: "/historico", icon: ICON.boletim },
  { label: "Relatórios", href: "/relatorios", icon: ICON.report },
];

export const navGroups: NavGroup[] = [
  {
    label: "Cadastros",
    icon: ICON.farm,
    items: [
      { label: "Fazendas", href: "/fazendas", icon: ICON.farm },
      { label: "Pivôs (Equipamentos)", href: "/pivos", icon: ICON.pivot },
      { label: "Solos", href: "/solos", icon: ICON.soil },
      { label: "Culturas", href: "/culturas", icon: ICON.crop },
      { label: "Parcelas", href: "/vinculacao", icon: ICON.parcel },
    ],
  },
  {
    label: "Manejo Diário",
    icon: ICON.decision,
    items: [
      { label: "Clima", href: "/clima", icon: ICON.cloud },
      { label: "Balanço Hídrico", href: "/balanco-hidrico", icon: ICON.balance },
      { label: "Decisão de Irrigação", href: "/operacao/decisao", icon: ICON.decision },
      { label: "Programação de Irrigação", href: "/programacao", icon: ICON.schedule },
    ],
  },
  {
    label: "Lançamentos",
    icon: ICON.boletim,
    items: [
      { label: "Irrigação Aplicada", href: "/lancamentos/irrigacao", icon: ICON.boletim },
      { label: "Sensorial de Solo", href: "/lancamentos/sensorial-solo", icon: ICON.soil },
    ],
  },
  {
    label: "Energia & Custos",
    icon: ICON.energy,
    items: [
      { label: "Energia", href: "/energia", icon: ICON.energy },
      { label: "Rateio", href: "/rateio", icon: ICON.cashflow },
      { label: "Custos", href: "/custos", icon: ICON.cost },
    ],
  },
];

export const bottomItems: NavItem[] = [
  { label: "Configurações", href: "/configuracoes", icon: ICON.settings },
];

export const navItems: NavItem[] = [
  ...topLevelItems,
  ...navGroups.flatMap((g) => g.items),
  ...bottomItems,
];
