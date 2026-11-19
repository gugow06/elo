import type { Metadata } from "next";
import { Nunito_Sans } from "next/font/google";
import "./globals.css";

const nunito = Nunito_Sans({ subsets: ["latin"], variable: "--font-nunito", display: "swap" });

export const metadata: Metadata = {
  title: { default: "ELO · Painel", template: "%s · ELO" },
  description: "Painel do ELO: fila do técnico do CRAS e gestão da rede solidária.",
  icons: { icon: "/elo-favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={nunito.variable}>
      <body className="min-h-screen antialiased">
        <a href="#conteudo" className="sr-only-focusable fixed left-2 top-2 z-50 rounded-md bg-brand-900 px-4 py-2 text-white">
          Pular para o conteúdo
        </a>
        {children}
      </body>
    </html>
  );
}
