"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alerta, Botao, Cartao, Carregando, FaixaRisco, Tag } from "@/components/ui";
import { api } from "@/lib/api";
import { CANAL, CATEGORIA, ORIGEM_TRIAGEM, dataHora } from "@/lib/formato";

interface Classificacao {
  faixa: "verde" | "amarela" | "vermelha";
  categoria: string;
  confianca: number | null;
  origem: string;
  regra: string | null;
  justificativa: string;
  criado_em: string;
}

interface Ficha {
  id: string;
  protocolo: string;
  faixa: "verde" | "amarela" | "vermelha";
  categoria: string;
  status: string;
  canal: string;
  relato: string;
  bairro: string;
  cidadao: string;
  telefone: string;
  criado_em: string;
  classificacoes: Classificacao[];
}

/** Ficha do pedido: relato original (leitura auditada), histórico de triagem, reclassificação e conclusão. */
export default function FichaPedido() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [faixa, setFaixa] = useState("amarela");
  const [categoria, setCategoria] = useState("outro");
  const [justificativa, setJustificativa] = useState("");
  const [desfecho, setDesfecho] = useState("resolvida_cras");

  const carregar = useCallback(() => {
    api<Ficha>(`/tecnico/solicitacoes/${id}`)
      .then((f) => {
        setFicha(f);
        setFaixa(f.faixa);
        setCategoria(f.categoria);
      })
      .catch((e) => setErro(e.message));
  }, [id]);

  useEffect(carregar, [carregar]);

  async function reclassificar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      const r = await api<{ status: string }>(`/tecnico/solicitacoes/${id}/reclassificar`, {
        method: "POST",
        body: JSON.stringify({ faixa, categoria, justificativa }),
      });
      setOk(r.status === "no_mural" ? "Reclassificado como verde: o pedido foi para o mural do bairro." : "Reclassificação registrada.");
      setJustificativa("");
      carregar();
    } catch (er) {
      setErro((er as Error).message);
    }
  }

  async function concluir(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await api(`/tecnico/solicitacoes/${id}/concluir`, { method: "POST", body: JSON.stringify({ desfecho }) });
      router.push("/fila");
    } catch (er) {
      setErro((er as Error).message);
    }
  }

  if (!ficha && !erro) return <Carregando texto="Carregando a ficha…" />;

  return (
    <div className="flex flex-col gap-5">
      <Link href="/fila" className="font-bold text-brand-700 underline-offset-4 hover:underline">
        ← Voltar para a fila
      </Link>
      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {ok && <Alerta tipo="ok">{ok}</Alerta>}
      {ficha && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-extrabold text-brand-900">
              Pedido <span className="font-mono tracking-widest">{ficha.protocolo}</span>
            </h1>
            <FaixaRisco faixa={ficha.faixa} detalhada />
            <Tag>{CATEGORIA[ficha.categoria] ?? ficha.categoria}</Tag>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Cartao className="lg:col-span-2">
              <h2 className="mb-2 text-lg font-extrabold text-brand-900">Relato original</h2>
              <p className="mb-3 text-sm text-texto-2">Dado sensível: esta leitura foi registrada na trilha de auditoria.</p>
              <blockquote className="rounded-md border-l-4 border-brand-600 bg-fundo p-4 text-lg">“{ficha.relato}”</blockquote>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div><dt className="font-bold text-texto-2">Cidadão</dt><dd>{ficha.cidadao}</dd></div>
                <div><dt className="font-bold text-texto-2">Telefone</dt><dd>{ficha.telefone}</dd></div>
                <div><dt className="font-bold text-texto-2">Bairro</dt><dd>{ficha.bairro}</dd></div>
                <div><dt className="font-bold text-texto-2">Canal</dt><dd>{CANAL[ficha.canal] ?? ficha.canal} · {dataHora(ficha.criado_em)}</dd></div>
              </dl>
            </Cartao>

            <Cartao>
              <h2 className="mb-3 text-lg font-extrabold text-brand-900">Histórico da triagem</h2>
              <ol className="flex flex-col gap-3">
                {ficha.classificacoes.map((c, i) => (
                  <li key={i} className="border-l-2 border-borda pl-3">
                    <FaixaRisco faixa={c.faixa} />
                    <p className="mt-1 text-sm font-bold">{ORIGEM_TRIAGEM[c.origem] ?? c.origem}{c.regra ? ` · ${c.regra}` : ""}</p>
                    <p className="text-sm text-texto-2">{c.justificativa}</p>
                    <p className="text-xs text-texto-2">{dataHora(c.criado_em)}{c.confianca !== null ? ` · confiança ${Math.round(Number(c.confianca) * 100)}%` : ""}</p>
                  </li>
                ))}
              </ol>
            </Cartao>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Cartao>
              <h2 className="mb-3 text-lg font-extrabold text-brand-900">Reclassificar</h2>
              <form onSubmit={reclassificar} className="flex flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 font-bold">
                    Faixa
                    <select value={faixa} onChange={(e) => setFaixa(e.target.value)} className="min-h-12 rounded-md border-2 border-borda px-3 font-normal">
                      <option value="verde">Verde · rede cidadã (vai ao mural)</option>
                      <option value="amarela">Amarela · contato pessoal</option>
                      <option value="vermelha">Vermelha · risco</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 font-bold">
                    Categoria
                    <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="min-h-12 rounded-md border-2 border-borda px-3 font-normal">
                      {Object.entries(CATEGORIA).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                    </select>
                  </label>
                </div>
                <label htmlFor="justificativa" className="font-bold">Justificativa (obrigatória)</label>
                <textarea
                  id="justificativa"
                  required
                  minLength={10}
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                  aria-describedby="justificativa-ajuda"
                  className="min-h-24 rounded-md border-2 border-borda p-3"
                />
                <p id="justificativa-ajuda" className="text-sm text-texto-2">Fica registrada na auditoria. A classificação anterior não é apagada.</p>
                <Botao type="submit">Registrar reclassificação</Botao>
              </form>
            </Cartao>

            <Cartao>
              <h2 className="mb-3 text-lg font-extrabold text-brand-900">Concluir atendimento</h2>
              <form onSubmit={concluir} className="flex flex-col gap-3">
                <label className="flex flex-col gap-1 font-bold">
                  Desfecho
                  <select value={desfecho} onChange={(e) => setDesfecho(e.target.value)} className="min-h-12 rounded-md border-2 border-borda px-3 font-normal">
                    <option value="resolvida_cras">Resolvido pelo CRAS</option>
                    <option value="encaminhada">Encaminhado (CREAS, saúde, outro serviço)</option>
                    <option value="nao_atendida">Não atendido</option>
                    <option value="cancelada">Cancelado</option>
                  </select>
                </label>
                <Botao type="submit" variante="secundario">Concluir e voltar à fila</Botao>
              </form>
            </Cartao>
          </div>
        </>
      )}
    </div>
  );
}
