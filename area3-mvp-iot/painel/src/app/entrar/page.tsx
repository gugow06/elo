"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alerta, Botao } from "@/components/ui";
import { api, salvarSessao, type UsuarioSessao } from "@/lib/api";

const CONTAS_DEMO = [
  { rotulo: "Fernanda · Técnica do CRAS", telefone: "+5511990000006" },
  { rotulo: "Secretaria · Gestão", telefone: "+5511990000007" },
];

/** Login sem senha (RF-102): telefone + código de 6 dígitos. Operadores do painel. */
export default function Entrar() {
  const router = useRouter();
  const [telefone, setTelefone] = useState("");
  const [codigo, setCodigo] = useState("");
  const [etapa, setEtapa] = useState<"telefone" | "codigo">("telefone");
  const [codigoDemo, setCodigoDemo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function pedirCodigo(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const r = await api<{ codigo_demo?: string }>("/auth/codigo", { method: "POST", body: JSON.stringify({ telefone }) });
      setCodigoDemo(r.codigo_demo ?? null);
      setEtapa("codigo");
    } catch (er) {
      setErro((er as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const r = await api<{ token: string; usuario: UsuarioSessao }>("/auth/entrar", { method: "POST", body: JSON.stringify({ telefone, codigo }) });
      if (r.usuario.perfil !== "tecnico" && r.usuario.perfil !== "gestor") {
        setErro("O painel é para a equipe do CRAS e a gestão. Cidadãos e voluntários usam o app do ELO.");
        return;
      }
      salvarSessao(r.token, r.usuario);
      router.replace(r.usuario.perfil === "tecnico" ? "/fila" : "/gestao");
    } catch (er) {
      setErro((er as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main id="conteudo" className="grid min-h-screen place-items-center bg-gradient-to-b from-brand-50 to-fundo px-4">
      <div className="w-full max-w-md rounded-xl bg-superficie p-8 shadow-e2">
        <Image src="/elo-logo.svg" alt="ELO" width={132} height={70} priority className="mb-4" />
        <h1 className="text-2xl font-extrabold text-brand-900">Painel municipal</h1>
        <p className="mb-6 text-texto-2">Cidadãos conectam. Comunidades fortalecem. O município avança.</p>

        {erro && <div className="mb-4"><Alerta tipo="erro">{erro}</Alerta></div>}

        {etapa === "telefone" ? (
          <form onSubmit={pedirCodigo} className="flex flex-col gap-4">
            <label htmlFor="telefone" className="font-bold">
              Telefone
            </label>
            <input
              id="telefone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              aria-describedby="telefone-ajuda"
              className="min-h-12 rounded-md border-2 border-borda px-4 text-lg focus:border-brand-700"
              placeholder="+55 11 99000-0006"
            />
            <p id="telefone-ajuda" className="text-sm text-texto-2">
              Vamos enviar um código de 6 dígitos. Não é preciso senha.
            </p>
            <Botao type="submit" disabled={enviando}>
              {enviando ? "Enviando…" : "Receber código"}
            </Botao>
            <fieldset className="mt-2 rounded-md border border-borda p-3">
              <legend className="px-1 text-sm font-bold text-texto-2">Contas de demonstração (fictícias)</legend>
              <div className="flex flex-col gap-2">
                {CONTAS_DEMO.map((c) => (
                  <button key={c.telefone} type="button" onClick={() => setTelefone(c.telefone)} className="min-h-11 rounded-md bg-fundo px-3 text-left font-semibold text-brand-900 hover:bg-brand-50">
                    {c.rotulo} · {c.telefone}
                  </button>
                ))}
              </div>
            </fieldset>
          </form>
        ) : (
          <form onSubmit={entrar} className="flex flex-col gap-4">
            {codigoDemo && (
              <Alerta tipo="info">
                Modo demonstração: o código enviado por SMS é <strong className="tracking-widest">{codigoDemo}</strong>
              </Alerta>
            )}
            <label htmlFor="codigo" className="font-bold">
              Código de 6 dígitos
            </label>
            <input
              id="codigo"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
              className="min-h-12 rounded-md border-2 border-borda px-4 text-center text-2xl tracking-[0.4em] focus:border-brand-700"
            />
            <Botao type="submit" disabled={enviando || codigo.length !== 6}>
              {enviando ? "Entrando…" : "Entrar"}
            </Botao>
            <Botao type="button" variante="texto" onClick={() => setEtapa("telefone")}>
              Usar outro telefone
            </Botao>
          </form>
        )}
      </div>
    </main>
  );
}
