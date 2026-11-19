"use client";

import { useEffect, useState } from "react";
import { campo, dataHora, SeletorPonto, usePontoAgente } from "@/components/agente";
import { Alerta, Botao, Cartao, Carregando, Tag } from "@/components/ui";
import { api } from "@/lib/api";

type Tipo = "entrega" | "retirada" | "codigo_errado";

interface Linha {
  tipo: Tipo;
  id: string;
  criado_em: string;
  protocolo: string;
  titulo: string;
  ponto_coleta: string | null;
  origem: string;
  registrado_por: string | null;
  trouxe: string | null;
  itens: { descricao: string; quantidade: number | null }[];
}

const TIPO: Record<Tipo, { rotulo: string; tom: "marca" | "acento" | "neutro" }> = {
  entrega: { rotulo: "Doação recebida", tom: "marca" },
  retirada: { rotulo: "Retirada", tom: "acento" },
  codigo_errado: { rotulo: "Código errado", tom: "neutro" },
};

function quem(l: Linha) {
  if (l.origem === "sensor") return "Sensor do ponto";
  if (l.origem === "app") return "Quem pediu, no app";
  return l.registrado_por ?? (l.origem === "manual" ? "Registro manual" : "—");
}

/**
 * Registro (log) do ponto de coleta: cada doação recebida, cada retirada e cada tentativa de
 * retirada com código errado, a mais recente primeiro. Tudo o que é registrado no painel, no
 * sensor ou no app fica salvo aqui.
 */
export default function Registro() {
  const { pontos } = usePontoAgente();
  const [ponto, setPonto] = useState("");
  const [tipo, setTipo] = useState<"" | Tipo>("");
  const [protocolo, setProtocolo] = useState("");
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState(0); // "Atualizar" busca de novo

  // Protocolo pela metade não filtra: espera completar os 6 números
  const filtroProtocolo = protocolo.length === 6 ? protocolo : "";
  useEffect(() => {
    const q = new URLSearchParams({ limite: "200" });
    if (ponto) q.set("ponto_coleta_id", ponto);
    if (tipo) q.set("tipo", tipo);
    if (filtroProtocolo) q.set("protocolo", filtroProtocolo);
    let vivo = true;
    api<Linha[]>(`/agente/registro?${q}`)
      .then((r) => {
        if (!vivo) return;
        setErro(null);
        setLinhas(r);
      })
      .catch((err) => {
        if (!vivo) return;
        setErro((err as Error).message);
        setLinhas([]);
      });
    return () => {
      vivo = false;
    };
  }, [ponto, tipo, filtroProtocolo, versao]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold text-brand-900">Registro</h1>
          <p className="text-texto-2">Tudo o que entrou e saiu dos pontos de coleta: doações recebidas, retiradas e tentativas com código errado.</p>
        </div>
        <Botao variante="secundario" onClick={() => setVersao((v) => v + 1)}>Atualizar</Botao>
      </div>

      <Cartao>
        <div className="grid gap-4 md:grid-cols-3">
          {pontos ? <SeletorPonto pontos={pontos} ponto={ponto} aoMudar={setPonto} rotulo="Ponto de coleta" todos /> : <Carregando />}
          <div>
            <label htmlFor="tipo" className="font-bold">O que aconteceu</label>
            <select id="tipo" className={campo} value={tipo} onChange={(e) => setTipo(e.target.value as "" | Tipo)}>
              <option value="">Tudo</option>
              <option value="entrega">Doações recebidas</option>
              <option value="retirada">Retiradas</option>
              <option value="codigo_errado">Códigos errados</option>
            </select>
          </div>
          <div>
            <label htmlFor="protocolo" className="font-bold">Protocolo (opcional)</label>
            <input
              id="protocolo"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              className={`${campo} tracking-[0.3em]`}
              value={protocolo}
              onChange={(e) => setProtocolo(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
            />
          </div>
        </div>
      </Cartao>

      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      {!linhas ? (
        <Carregando />
      ) : linhas.length === 0 ? (
        <Alerta tipo="info">Nada registrado com esses filtros.</Alerta>
      ) : (
        <Cartao className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <caption className="sr-only">Registro de entregas e retiradas</caption>
            <thead className="border-b border-borda text-sm text-texto-2">
              <tr>
                <th className="py-2 pr-3">Quando</th>
                <th className="py-2 pr-3">O quê</th>
                <th className="py-2 pr-3">Pedido</th>
                <th className="py-2 pr-3">Itens</th>
                <th className="py-2 pr-3">Ponto</th>
                <th className="py-2">Registrado por</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={`${l.tipo}-${l.id}`} className="border-b border-borda align-top">
                  <td className="py-3 pr-3 whitespace-nowrap font-bold">{dataHora(l.criado_em)}</td>
                  <td className="py-3 pr-3 whitespace-nowrap"><Tag tom={TIPO[l.tipo].tom}>{TIPO[l.tipo].rotulo}</Tag></td>
                  <td className="py-3 pr-3">
                    <span className="font-bold tracking-wider">{l.protocolo}</span>
                    <span className="block text-sm text-texto-2">{l.titulo}</span>
                  </td>
                  <td className="py-3 pr-3">
                    {l.tipo === "codigo_errado"
                      ? <span className="text-texto-2">Retirada recusada</span>
                      : l.itens.length
                        ? l.itens.map((i) => `${i.descricao}${i.quantidade && i.quantidade > 1 ? ` (${i.quantidade})` : ""}`).join(", ")
                        : <span className="text-texto-2">Não detalhados (sensor)</span>}
                    {l.trouxe && <span className="block text-sm text-texto-2">Trazido por {l.trouxe}</span>}
                  </td>
                  <td className="py-3 pr-3">{l.ponto_coleta ?? "—"}</td>
                  <td className="py-3">{quem(l)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Cartao>
      )}
    </div>
  );
}
