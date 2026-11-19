"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { lerSessao, NOME_PERFIL, sair, useModoDemo, type UsuarioSessao } from "@/lib/api";

const MENU = [
  { href: "/receber", rotulo: "Receber doação", icone: "📦", perfis: ["agente", "tecnico", "gestor"] },
  { href: "/retirar", rotulo: "Retirar doação", icone: "🤲", perfis: ["agente", "tecnico", "gestor"] },
  { href: "/registro", rotulo: "Registro", icone: "🧾", perfis: ["agente", "tecnico", "gestor"] },
  { href: "/fila", rotulo: "Fila do CRAS", icone: "📋", perfis: ["tecnico"] },
  { href: "/gestao", rotulo: "Gestão da rede", icone: "📊", perfis: ["gestor", "tecnico"] },
  { href: "/locais", rotulo: "Locais da rede", icone: "📍", perfis: ["gestor", "tecnico"] },
  { href: "/equipe", rotulo: "Equipe", icone: "👥", perfis: ["gestor"] },
];

/** Layout autenticado do painel: cabeçalho, navegação e proteção de rota por perfil. */
export function Shell({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioSessao | null>(null);
  const router = useRouter();
  const caminho = usePathname();
  const modoDemo = useModoDemo();

  useEffect(() => {
    const s = lerSessao();
    if (!s) router.replace("/entrar");
    else setUsuario(s.usuario);
  }, [router]);

  if (!usuario) return null;
  const itens = MENU.filter((m) => m.perfis.includes(usuario.perfil));

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-borda bg-superficie/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3">
          <Link href={itens[0]?.href ?? "/"} className="flex items-center gap-3" aria-label="ELO, ir para o início">
            <Image src="/elo-logo-ajustada.svg" alt="" width={72} height={38} priority />
            <span className="hidden border-l border-borda pl-3 text-sm font-bold text-texto-2 sm:inline">Painel municipal</span>
          </Link>
          <nav aria-label="Principal" className="flex flex-1 gap-1">
            {itens.map((m) => {
              const ativo = caminho.startsWith(m.href);
              return (
                <Link
                  key={m.href}
                  href={m.href}
                  aria-current={ativo ? "page" : undefined}
                  className={`flex min-h-12 items-center gap-2 rounded-full px-4 font-bold ${ativo ? "bg-brand-100 text-brand-900" : "text-texto-2 hover:bg-fundo"}`}
                >
                  <span aria-hidden="true">{m.icone}</span>
                  {m.rotulo}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="font-bold leading-tight">{usuario.nome}</p>
              <p className="text-sm text-texto-2">{NOME_PERFIL[usuario.perfil] ?? ""}</p>
            </div>
            <button onClick={sair} className="min-h-12 rounded-full border-2 border-borda px-4 font-bold text-brand-900 hover:border-brand-700">
              Sair
            </button>
          </div>
        </div>
      </header>
      <main id="conteudo" className="mx-auto max-w-7xl px-4 py-6">
        {children}
      </main>
      <footer className="mx-auto max-w-7xl px-4 pb-8 text-sm text-texto-2">
        ELO{modoDemo ? " · Dados fictícios de demonstração" : ""} · Nenhum dado pessoal é exibido no módulo de gestão.
      </footer>
    </div>
  );
}
