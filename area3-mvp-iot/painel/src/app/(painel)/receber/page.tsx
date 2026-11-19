"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Alerta, Botao, Cartao, Carregando, Tag } from "@/components/ui";
import { api } from "@/lib/api";

interface Ponto {
  id: string;
  nome: string;
  endereco: string;
}

interface Item {
  id: string;
  descricao: string;
  status: "aberto" | "comprometido" | "entregue" | "obtido";
  quantidade: number;
  quem_leva: string[];
}

interface Pedido {
  id: string;
  protocolo: string;
  titulo: string;
  status: string;
  status_texto: string;
  recebe_doacao: boolean;
  bairro: string;
  ponto_coleta: string | null;
  itens: Item[];
  ajudantes: { oferta_id: string; nome: string; itens: string[] }[];
  entregas: { criado_em: string; origem: string; ponto_coleta: string; itens: { descricao: string; quantidade: number }[] }[];
}

const campo = "min-h-12 w-full rounded-md border-2 border-borda bg-superficie px-3 focus:border-brand-700 focus:outline-none";
const CHAVE_PONTO = "elo.ponto";
const ORIGEM: Record<string, string> = { painel: "Registrada no painel", sensor: "Sensor do ponto", manual: "Manual" };

function Situacao({ item }: { item: Item }) {
  if (item.status === "obtido") return <Tag tom="neutro">Já retirado por quem pediu</Tag>;
  if (item.status === "entregue") return <Tag tom="marca">Chegou ao ponto{item.quantidade ? ` · ${item.quantidade}` : ""}</Tag>;
  if (item.status === "comprometido") return <Tag tom="acento">{item.quem_leva.join(", ")} vai levar</Tag>;
  return <Tag tom="neutro">Ninguém combinou ainda</Tag>;
}

/**
 * Agente do ponto de coleta: a pessoa chega com a doação e informa o protocolo de 6 números.
 * O agente vê o pedido (o que precisa e quem combinou levar o quê no app) e marca o que chegou,
 * com a quantidade. Quem pediu e quem ajudou são avisados no app na hora.
 */
export default function ReceberDoacao() {
  const [pontos, setPontos] = useState<Ponto[] | null>(null);
  const [ponto, setPonto] = useState("");
  const [protocolo, setProtocolo] = useState("");
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [quem, setQuem] = useState<string>(""); // oferta_id ou "" (outra pessoa)
  const [marcados, setMarcados] = useState<Record<string, number>>({}); // item_id → quantidade
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const entradaProtocolo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<Ponto[]>("/agente/pontos")
      .then((p) => {
        setPontos(p);
        const salvo = localStorage.getItem(CHAVE_PONTO);
        setPonto(p.some((x) => x.id === salvo) ? salvo! : (p[0]?.id ?? ""));
      })
      .catch((e) => setErro(e.message));
  }, []);

  function escolherPonto(id: string) {
    setPonto(id);
    localStorage.setItem(CHAVE_PONTO, id);
  }

  async function buscar(e?: FormEvent) {
    e?.preventDefault();
    setErro(null);
    setAviso(null);
    setPedido(null);
    setMarcados({});
    setQuem("");
    if (!/^\d{6}$/.test(protocolo)) {
      setErro("O protocolo tem 6 números. Peça para a pessoa mostrar no app ou na mensagem que recebeu.");
      return;
    }
    setOcupado(true);
    try {
      setPedido(await api<Pedido>(`/agente/pedidos/${protocolo}`));
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  /** Escolher quem trouxe já marca os itens que essa pessoa combinou levar. */
  function escolherQuem(ofertaId: string) {
    setQuem(ofertaId);
    const a = pedido?.ajudantes.find((x) => x.oferta_id === ofertaId);
    if (!a || !pedido) return;
    const novos: Record<string, number> = {};
    for (const i of pedido.itens) if (a.itens.includes(i.id) && i.status !== "obtido") novos[i.id] = marcados[i.id] ?? 1;
    setMarcados(novos);
  }

  function alternar(item: Item, marcado: boolean) {
    setMarcados((m) => {
      const n = { ...m };
      if (marcado) n[item.id] = m[item.id] ?? 1;
      else delete n[item.id];
      return n;
    });
  }

  async function registrar() {
    if (!pedido) return;
    const itens = Object.entries(marcados).map(([item_id, quantidade]) => ({ item_id, quantidade }));
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      const r = await api<{ mensagem: string; pedido: Pedido }>(`/agente/pedidos/${pedido.protocolo}/entregas`, {
        method: "POST",
        body: JSON.stringify({ ponto_coleta_id: ponto, oferta_id: quem || null, itens }),
      });
      setAviso(r.mensagem);
      setPedido(r.pedido);
      setMarcados({});
      setQuem("");
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  function proximo() {
    setPedido(null);
    setProtocolo("");
    setAviso(null);
    setErro(null);
    entradaProtocolo.current?.focus();
  }

  const totalMarcado = Object.keys(marcados).length;
  const pontoAtual = pontos?.find((p) => p.id === ponto);
  const outroPonto = pedido?.ponto_coleta && pontoAtual && pedido.ponto_coleta !== pontoAtual.nome ? pedido.ponto_coleta : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-brand-900">Receber doação</h1>
        <p className="text-texto-2">
          A pessoa chega com a doação e informa o protocolo de 6 números. Marque o que ela trouxe: quem pediu e quem ajudou são avisados no app.
        </p>
      </div>

      {!pontos ? (
        <Carregando />
      ) : pontos.length === 0 ? (
        <Alerta tipo="erro">Nenhum ponto de coleta cadastrado no município. A gestão cadastra em Locais da rede.</Alerta>
      ) : (
        <Cartao>
          <form onSubmit={buscar} className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <div>
              <label htmlFor="ponto" className="font-bold">Você está no</label>
              <select id="ponto" className={campo} value={ponto} onChange={(e) => escolherPonto(e.target.value)}>
                {pontos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
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
                aria-describedby="protocolo-ajuda"
              />
              <p id="protocolo-ajuda" className="mt-1 text-sm text-texto-2">Está no app da pessoa, em &quot;Minhas ajudas&quot;.</p>
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

          {!pedido.recebe_doacao ? (
            <div className="mt-4"><Alerta tipo="info">Este pedido não recebe mais doações. Agradeça a pessoa e oriente a procurar outro pedido no app.</Alerta></div>
          ) : (
            <>
              {pedido.ajudantes.length > 0 && (
                <fieldset className="mt-6">
                  <legend className="font-bold">Quem trouxe?</legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {pedido.ajudantes.map((a) => (
                      <label key={a.oferta_id} className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-full border-2 px-4 ${quem === a.oferta_id ? "border-brand-700 bg-brand-50" : "border-borda"}`}>
                        <input type="radio" name="quem" checked={quem === a.oferta_id} onChange={() => escolherQuem(a.oferta_id)} />
                        <span className="font-bold">{a.nome}</span>
                        <span className="text-sm text-texto-2">({a.itens.length} {a.itens.length === 1 ? "item" : "itens"} combinados)</span>
                      </label>
                    ))}
                    <label className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-full border-2 px-4 ${quem === "" ? "border-brand-700 bg-brand-50" : "border-borda"}`}>
                      <input type="radio" name="quem" checked={quem === ""} onChange={() => setQuem("")} />
                      <span className="font-bold">Outra pessoa</span>
                    </label>
                  </div>
                </fieldset>
              )}

              <table className="mt-6 w-full text-left">
                <caption className="mb-2 text-left font-bold">O que a pessoa trouxe agora</caption>
                <thead className="border-b border-borda text-sm text-texto-2">
                  <tr>
                    <th className="py-2 pr-3">Chegou</th>
                    <th className="py-2 pr-3">Item</th>
                    <th className="py-2 pr-3">Situação</th>
                    <th className="py-2">Quantidade</th>
                  </tr>
                </thead>
                <tbody>
                  {pedido.itens.map((i) => {
                    const marcado = i.id in marcados;
                    const travado = i.status === "obtido";
                    return (
                      <tr key={i.id} className={`border-b border-borda ${marcado ? "bg-brand-50" : ""}`}>
                        <td className="py-3 pr-3">
                          <input
                            type="checkbox"
                            className="h-6 w-6"
                            checked={marcado}
                            disabled={travado}
                            onChange={(e) => alternar(i, e.target.checked)}
                            aria-label={`${i.descricao} chegou`}
                          />
                        </td>
                        <td className="py-3 pr-3 font-bold">{i.descricao}</td>
                        <td className="py-3 pr-3"><Situacao item={i} /></td>
                        <td className="py-3">
                          <input
                            type="number"
                            min={1}
                            max={999}
                            disabled={!marcado}
                            className={`${campo} max-w-28`}
                            value={marcados[i.id] ?? ""}
                            onChange={(e) => setMarcados((m) => ({ ...m, [i.id]: Math.max(1, Math.min(999, Number(e.target.value) || 1)) }))}
                            aria-label={`Quantidade de ${i.descricao}`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {outroPonto && (
                <div className="mt-4">
                  <Alerta tipo="risco">
                    Este pedido estava combinado para retirada no <strong>{outroPonto}</strong>. Ao registrar aqui, quem pediu será avisado para
                    retirar no <strong>{pontoAtual!.nome}</strong>.
                  </Alerta>
                </div>
              )}
              <p className="mt-2 text-sm text-texto-2">
                O mesmo item pode chegar mais de uma vez (comida, material escolar…): a quantidade soma com o que já chegou.
              </p>
              <div className="mt-4">
                <Botao onClick={registrar} disabled={ocupado || totalMarcado === 0 || !ponto}>
                  {ocupado ? "Registrando…" : totalMarcado ? `Registrar entrega de ${totalMarcado} ${totalMarcado === 1 ? "item" : "itens"}` : "Marque o que chegou"}
                </Botao>
              </div>
            </>
          )}

          {pedido.entregas.length > 0 && (
            <div className="mt-8">
              <h3 className="font-extrabold text-brand-900">Entregas deste pedido</h3>
              <ul className="mt-2 space-y-2">
                {pedido.entregas.map((e, k) => (
                  <li key={k} className="rounded-md bg-fundo p-3">
                    <span className="font-bold">{new Date(e.criado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
                    {" · "}{e.ponto_coleta} · {ORIGEM[e.origem] ?? e.origem}
                    <span className="block text-texto-2">
                      {e.itens.length ? e.itens.map((x) => `${x.descricao}${x.quantidade > 1 ? ` (${x.quantidade})` : ""}`).join(", ") : "Itens não detalhados (sensor)"}
                    </span>
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
