"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alerta, Cartao, Carregando, FaixaRisco, Tag } from "@/components/ui";
import { api, assinarEventos } from "@/lib/api";
import { CANAL, CATEGORIA, ORIGEM_TRIAGEM, dataHora, tempoEspera } from "@/lib/formato";

interface ItemFila {
  id: string;
  protocolo: string;
  faixa: "verde" | "amarela" | "vermelha";
  categoria: string;
  titulo: string;
  canal: string;
  escalado: boolean;
  criado_em: string;
  bairro: string;
  cidadao: string;
  horas_espera: number;
  classificacao_origem: string;
  classificacao_regra: string | null;
  classificacao_justificativa: string;
}

/** Fila do técnico do CRAS: priorizada por risco e tempo de espera (RF-501), com alerta ativo (RF-502). */
export default function Fila() {
  const [itens, setItens] = useState<ItemFila[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [alerta, setAlerta] = useState<string | null>(null);

  const carregar = useCallback(() => {
    api<ItemFila[]>("/tecnico/fila").then(setItens).catch((e) => setErro(e.message));
  }, []);

  useEffect(() => {
    carregar();
    const parar = assinarEventos("/tecnico/eventos", (tipo, dados) => {
      if (tipo === "alerta_vermelho") {
        const d = dados as { protocolo: string };
        setAlerta(`Novo pedido com indício de risco: protocolo ${d.protocolo}. Atenda com prioridade.`);
        try {
          new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=").play().catch(() => undefined);
        } catch {
          /* som é opcional */
        }
      }
      if (tipo.startsWith("solicitacao") || tipo === "alerta_vermelho") carregar();
    });
    const intervalo = setInterval(carregar, 30000);
    return () => {
      parar();
      clearInterval(intervalo);
    };
  }, [carregar]);

  const vermelhos = itens?.filter((i) => i.faixa === "vermelha").length ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold text-brand-900">Fila do CRAS</h1>
          <p className="text-texto-2">Ordenada por risco e depois por tempo de espera. Atualiza sozinha.</p>
        </div>
        {itens && (
          <p className="text-lg font-bold" aria-live="polite">
            {itens.length} na fila · <span className="text-risco-vermelha">{vermelhos} com risco</span>
          </p>
        )}
      </div>

      <div aria-live="assertive">{alerta && <Alerta tipo="risco">🔔 {alerta}</Alerta>}</div>
      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {!itens && !erro && <Carregando texto="Carregando a fila…" />}
      {itens?.length === 0 && <Cartao>Nenhum pedido aguardando a equipe técnica.</Cartao>}

      <ol className="flex flex-col gap-3" aria-label="Pedidos na fila">
        {itens?.map((i) => (
          <li key={i.id}>
            <Link
              href={`/fila/${i.id}`}
              className={`block rounded-lg border-l-8 bg-superficie p-4 shadow-e1 hover:shadow-e2 ${
                i.faixa === "vermelha" ? "border-risco-vermelha" : i.faixa === "amarela" ? "border-accent-500" : "border-brand-600"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <FaixaRisco faixa={i.faixa} />
                <Tag>{CATEGORIA[i.categoria] ?? i.categoria}</Tag>
                {i.escalado && <Tag tom="neutro">Escalado: sem voluntário no prazo</Tag>}
                <span className="ml-auto font-mono text-lg font-bold tracking-widest text-brand-900" aria-label={`Protocolo ${i.protocolo.split("").join(" ")}`}>
                  {i.protocolo}
                </span>
              </div>
              <p className="mt-2 text-lg font-bold">
                {i.cidadao} · {i.bairro}
              </p>
              <p className="text-texto-2">
                Esperando há <strong className="text-texto">{tempoEspera(i.horas_espera)}</strong> · desde {dataHora(i.criado_em)} · via {CANAL[i.canal] ?? i.canal}
              </p>
              <p className="mt-1 text-sm text-texto-2">
                Triagem: {ORIGEM_TRIAGEM[i.classificacao_origem] ?? i.classificacao_origem}
                {i.classificacao_regra ? ` (${i.classificacao_regra})` : ""} — {i.classificacao_justificativa}
              </p>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
