import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Prévia do gráfico de manejo",
  robots: { index: false, follow: false },
};

export default function PreviewManejoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
