import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";

export const metadata: Metadata = {
  title: "Cotrim Irrigação Pro",
  description:
    "Sistema operacional para gestão de irrigação agrícola: pivôs centrais, " +
    "balanço hídrico, energia, custos, rateio, reservatórios, sensores e IA.",
};

/**
 * Layout raiz da aplicação.
 * Define a estrutura principal: menu lateral escuro + topbar + área central.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>
        <div className="flex min-h-screen">
          {/* Menu lateral escuro (fixo no desktop) */}
          <Sidebar />

          {/* Coluna de conteúdo: topbar + área central */}
          <div className="flex flex-1 flex-col lg:pl-64">
            <Topbar />
            <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
