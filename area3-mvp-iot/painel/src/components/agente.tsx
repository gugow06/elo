"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/** Partes comuns das telas do agente do ponto de coleta (Receber, Retirar e Registro). */

export interface Ponto {
  id: string;
  nome: string;
  endereco: string;
}

export const campo = "min-h-12 w-full rounded-md border-2 border-borda bg-superficie px-3 focus:border-brand-700 focus:outline-none";
const CHAVE_PONTO = "elo.ponto";

/** Pontos de coleta do município e o ponto onde o agente está (lembrado entre as telas). */
export function usePontoAgente() {
  const [pontos, setPontos] = useState<Ponto[] | null>(null);
  const [ponto, setPontoAtual] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api<Ponto[]>("/agente/pontos")
      .then((p) => {
        setPontos(p);
        const salvo = localStorage.getItem(CHAVE_PONTO);
        setPontoAtual(p.some((x) => x.id === salvo) ? salvo! : (p[0]?.id ?? ""));
      })
      .catch((e) => {
        setPontos([]);
        setErro((e as Error).message);
      });
  }, []);

  function setPonto(id: string) {
    setPontoAtual(id);
    localStorage.setItem(CHAVE_PONTO, id);
  }

  return { pontos, ponto, setPonto, erro, pontoAtual: pontos?.find((p) => p.id === ponto) };
}

export function SeletorPonto({ pontos, ponto, aoMudar, rotulo = "Você está no", todos }: {
  pontos: Ponto[];
  ponto: string;
  aoMudar: (id: string) => void;
  rotulo?: string;
  /** Mostra a opção "Todos os pontos" (valor ""). */
  todos?: boolean;
}) {
  return (
    <div>
      <label htmlFor="ponto" className="font-bold">{rotulo}</label>
      <select id="ponto" className={campo} value={ponto} onChange={(e) => aoMudar(e.target.value)}>
        {todos && <option value="">Todos os pontos</option>}
        {pontos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
      </select>
    </div>
  );
}

export function dataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
