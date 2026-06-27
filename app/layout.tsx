import type { Metadata } from "next";
import "./globals.css";
import { APP_NAME, APP_DESCRIPTION } from "@/constants/app";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_DESCRIPTION,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="bg-gray-50 text-graphite-900 antialiased dark:bg-graphite-950 dark:text-gray-100">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
