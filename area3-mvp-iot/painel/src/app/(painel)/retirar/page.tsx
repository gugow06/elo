"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { campo, dataHora, SeletorPonto, usePontoAgente } from "@/components/agente";
import { Alerta, Botao, Cartao, Carregando } from "@/components/ui";
import { api } from "@/lib/api";

interface Item {
  id: string;
  descricao: string;
  status: "aberto" | "comprometido" | "entregue" | "obtido";
  quantidade: number;
}

interface Pedido {
  protocolo: string;
  titulo: string;
  status_texto: string;
  bairro: string;
  ponto_coleta: string | null;
  pode_retirar: boolean;
  itens: Item[];
  retiradas: { criado_em: string; origem: string; ponto_coleta: string | null; itens: string[] }[];
}

const ORIGEM_RETIRADA: Record<string, string> = { painel: "Registrada no painel", sensor: "Sensor do ponto", app: "Confirmada no app" };

/**
 * Agente do ponto de coleta: quem pediu veio buscar a doação. O agente digita o protocolo e o
 * código de retirada (4 números que só quem pediu tem), marca o que a pessoa está levando e
 * registra. A retirada fica no Registro, e quem pediu e quem ajudou são avisados no app.
 */
export default function RetirarDoacao() {
  const { pontos, ponto, setPonto, erro: erroPontos } = usePontoAgente();
  const [protocolo, setProtocolo] = useState("");
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [codigo, setCodigo] = useState("");
  const [levando, setLevando] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const entradaProtocolo = useRef<HTMLInputElement>(null);

  async function carregar(p: string) {
    setErro(null);
    setPedido(null);
    setCodigo("");
    if (!/^\d{6}$/.test(p)) {
      setErro("O protocolo tem 6 números. Ele está no app de quem pediu, em \"Meus pedidos\".");
      return;
    }
    setOcupado(true);
    try {
      const r = await api<Pedido>(`/agente/pedidos/${p}`);
      setPedido(r);
      setLevando(r.itens.filter((i) => i.status === "entregue").map((i) => i.id));
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  // Vindo de "Receber doação" com o protocolo na URL: já abre o pedido
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("protocolo");
    if (!p || !/^\d{6}$/.test(p)) return;
    // Depois da montagem (a URL é externa ao React): preenche e busca
    void Promise.resolve().then(() => {
      setProtocolo(p);
      return carregar(p);
    });
  }, []);

  function buscar(e: FormEvent) {
    e.preventDefault();
    setAviso(null);
    void carregar(protocolo);
  }

  async function retirar(e: FormEvent) {
    e.preventDefault();
    if (!pedido) return;
    const prontos = pedido.itens.filter((i) => i.status === "entregue").map((i) => i.id);
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      const r = await api<{ mensagem: string; pedido: Pedido }>(`/agente/pedidos/${pedido.protocolo}/retiradas`, {
        method: "POST",
        body: JSON.stringify({ ponto_coleta_id: ponto, codigo, ...(levando.length === prontos.length ? {} : { itens: levando }) }),
      });
      setAviso(r.mensagem);
      setPedido(r.pedido);
      setCodigo("");
      setLevando(r.pedido.itens.filter((i) => i.status === "entregue").map((i) => i.id));
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  function proximo() {
    setPedido(null);
    setProtocolo("");
    setCodigo("");
    setAviso(null);
    setErro(null);
    entradaProtocolo.current?.focus();
  }

  const prontos = pedido?.itens.filter((i) => i.status === "entregue") ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-brand-900">Retirar doação</h1>
        <p className="text-texto-2">
          Quem pediu veio buscar a doação. Peça o protocolo e o código de retirada: os dois estão no app da pessoa, em &quot;Meus pedidos&quot;.
        </p>
      </div>

      {!pontos ? (
        <Carregando />
      ) : pontos.length === 0 ? (
        <Alerta tipo="erro">{erroPontos ?? "Nenhum ponto de coleta cadastrado no município. A gestão cadastra em Locais da rede."}</Alerta>
      ) : (
        <Cartao>
          <form onSubmit={buscar} className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <SeletorPonto pontos={pontos} ponto={ponto} aoMudar={setPonto} />
            <div>
              <label htmlFor="protocolo" className="font-bold">Protocolo</label>
              <input
                id="protocolo"
                ref={entradaProtocolo}
                autoFocus
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                className={`${campo} text-2xl font-extrabold tracking-[0.4em]`}
                value={protocolo}
                onChange={(e) => setProtocolo(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
              />
            </div>
            <Botao type="submit" disabled={ocupado || protocolo.length !== 6}>{ocupado && !pedido ? "Buscando…" : "Buscar pedido"}</Botao>
          </form>
        </Cartao>
      )}

      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {aviso && <Alerta tipo="ok">{aviso}</Alerta>}

      {pedido && (
        <Cartao>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-texto-2">Protocolo {pedido.protocolo} · Bairro {pedido.bairro}</p>
              <h2 className="text-2xl font-extrabold text-brand-900">{pedido.titulo}</h2>
              <p className="text-texto-2">{pedido.status_texto}{pedido.ponto_coleta ? ` · retirada no ${pedido.ponto_coleta}` : ""}</p>
            </div>
            <Botao variante="secundario" onClick={proximo}>Próximo protocolo</Botao>
          </div>

          {!pedido.pode_retirar || prontos.length === 0 ? (
            <div className="mt-4">
              <Alerta tipo="info">
                Nada deste pedido está no ponto para retirar agora. Quando a doação chegar, registre em{" "}
                <Link className="font-bold underline" href="/receber">Receber doação</Link>.
              </Alerta>
            </div>
          ) : (
            <form onSubmit={retirar} className="mt-6 space-y-4">
              <fieldset>
                <legend className="font-bold">O que a pessoa está levando</legend>
                {prontos.map((i) => (
                  <label key={i.id} className="mt-2 flex min-h-11 items-center gap-3">
                    <input
                      type="checkbox"
                      className="h-6 w-6"
                      checked={levando.includes(i.id)}
                      onChange={(e) => setLevando((l) => (e.target.checked ? [...l, i.id] : l.filter((x) => x !== i.id)))}
                    />
                    <span className="font-bold">{i.descricao}</span>
                    {i.quantidade > 1 && <span className="text-texto-2">({i.quantidade})</span>}
                  </label>
                ))}
              </fieldset>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label htmlFor="codigo" className="font-bold">Código de retirada</label>
                  <input
                    id="codigo"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={4}
                    className={`${campo} max-w-40 text-2xl font-extrabold tracking-[0.4em]`}
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="0000"
                    aria-describedby="codigo-ajuda"
                  />
                </div>
                <Botao type="submit" disabled={ocupado || codigo.length !== 4 || levando.length === 0 || !ponto}>
                  {ocupado ? "Registrando…" : `Registrar retirada de ${levando.length} ${levando.length === 1 ? "item" : "itens"}`}
                </Botao>
              </div>
              <p id="codigo-ajuda" className="text-sm text-texto-2">
                Só quem pediu tem o código: quem ajudou conhece o protocolo, mas não o código. Depois de 5 códigos errados, a retirada fica bloqueada por 1 hora.
              </p>
            </form>
          )}

          {pedido.retiradas.length > 0 && (
            <div className="mt-8">
              <h3 className="font-extrabold text-brand-900">Retiradas deste pedido</h3>
              <ul className="mt-2 space-y-2">
                {pedido.retiradas.map((r, k) => (
                  <li key={k} className="rounded-md bg-fundo p-3">
                    <span className="font-bold">{dataHora(r.criado_em)}</span>
                    {" · "}{r.ponto_coleta ?? "—"} · {ORIGEM_RETIRADA[r.origem] ?? r.origem}
                    <span className="block text-texto-2">{r.itens.length ? r.itens.join(", ") : "—"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Cartao>
      )}
    </div>
  );
}
