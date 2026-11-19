"use client";

import { useEffect, useMemo, useState } from "react";
import { Grafico } from "@/components/grafico";
import { Alerta, Botao, Cartao, Carregando, Kpi, type Meta } from "@/components/ui";
import { API_URL, api, assinarEventos, lerSessao } from "@/lib/api";
import { CANAL, CATEGORIA, num, pct } from "@/lib/formato";

type Aba = "geral" | "equidade" | "territorio" | "pontos" | "ia";
const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "geral", rotulo: "Visão geral" },
  { id: "equidade", rotulo: "Equidade" },
  { id: "territorio", rotulo: "Território" },
  { id: "pontos", rotulo: "Pontos de coleta" },
  { id: "ia", rotulo: "Qualidade da IA" },
];

interface Filtros { periodo: string; bairro: string; canal: string; categoria: string; faixa: string }
const FILTROS_INICIAIS: Filtros = { periodo: "180", bairro: "", canal: "", categoria: "", faixa: "" };

interface Indicadores {
  indicadores: Record<string, number | null>;
  metas: Record<string, Meta>;
}
interface Territorio { bairro: string; slug: string; populacao: number; pedidos: number; pedidos_por_mil_hab: number; pct_escalado: number; taxa_absorcao: number; voluntarios_ativos: number; voluntarios_por_200_hab: number; ranking_escalonamento: number }
interface Mensal { mes: string; total: number; variacao_pct: number | null }
interface Canal { semana: string; canal: string; total: number }
interface CategoriaLinha { categoria: string; faixa: string; total: number }
interface Previsao { ponto_coleta_id: string; ponto: string; capacidade_kg: number; estoque_kg: number; temperatura_c: number; consumo_medio_7d_kg: number; dias_ate_zerar: number; ocupacao_pct: number }
interface PontoAoVivo { id: string; nome: string; bairro: string; capacidade_kg: number; estoque_kg: number; ocupacao_pct: number; temperatura_c: number | null; alertas: string[] }
interface Avaliacao { modelo: string; total: number; acuracia: number; recall_vermelha: number; precisao_vermelha: number; falsos_negativos_vermelha: number; tempo_medio_ms: number; versao_lexico: string; versao_prompt: string | null }
interface Ia { avaliacoes: Record<string, Avaliacao | null>; producao: { origem_triagem: string; faixa: string; total: number; ms_medio: number }[] }

const isoDiasAtras = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const mesCurto = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });

function querystring(f: Filtros) {
  const p = new URLSearchParams({ inicio: isoDiasAtras(Number(f.periodo)), fim: isoDiasAtras(0) });
  for (const k of ["bairro", "canal", "categoria", "faixa"] as const) if (f[k]) p.set(k, f[k]);
  return p.toString();
}

/** Módulo Gestão (RF-601 a RF-606): só agregados da camada ouro, sem nenhum dado pessoal. */
export default function Gestao() {
  const [aba, setAba] = useState<Aba>("geral");
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIAIS);
  const [ind, setInd] = useState<Indicadores | null>(null);
  const [cats, setCats] = useState<CategoriaLinha[]>([]);
  const [mensal, setMensal] = useState<Mensal[]>([]);
  const [canais, setCanais] = useState<Canal[]>([]);
  const [terr, setTerr] = useState<Territorio[]>([]);
  const [previsao, setPrevisao] = useState<Previsao[]>([]);
  const [entregas, setEntregas] = useState<{ origem: string; entregas: number; horas_ate_deposito: number }[]>([]);
  const [aoVivo, setAoVivo] = useState<PontoAoVivo[]>([]);
  const [ultimoEvento, setUltimoEvento] = useState<string | null>(null);
  const [ia, setIa] = useState<Ia | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const qs = useMemo(() => querystring(filtros), [filtros]);

  useEffect(() => {
    setErro(null);
    Promise.all([api<Indicadores>(`/gestao/indicadores?${qs}`), api<CategoriaLinha[]>(`/gestao/categorias?${qs}`), api<Canal[]>(`/gestao/canais?${qs}`)])
      .then(([i, c, ca]) => { setInd(i); setCats(c); setCanais(ca); })
      .catch((e) => setErro(`Não foi possível carregar os indicadores (${e.message}). O pipeline de dados já rodou?`));
  }, [qs]);

  useEffect(() => {
    api<Mensal[]>("/gestao/mensal").then(setMensal).catch(() => undefined);
    api<Territorio[]>("/gestao/territorio").then(setTerr).catch(() => undefined);
    api<{ previsao: Previsao[]; entregas: typeof entregas }>("/gestao/pontos").then((p) => { setPrevisao(p.previsao); setEntregas(p.entregas); }).catch(() => undefined);
    api<Ia>("/gestao/ia").then(setIa).catch(() => undefined);
  }, []);

  // Pontos de coleta ao vivo: estado operacional + eventos dos sensores (SSE)
  useEffect(() => {
    const carregar = () => api<PontoAoVivo[]>("/pontos").then(setAoVivo).catch(() => undefined);
    carregar();
    const parar = assinarEventos("/tecnico/eventos", (tipo, dados) => {
      if (tipo === "entrega_registrada") {
        const d = dados as { protocolo: string; dados: { delta_peso_kg: number } };
        setUltimoEvento(`Entrega registrada pelo sensor: pedido ${d.protocolo}, +${num(d.dados.delta_peso_kg, 1)} kg.`);
      }
      if (tipo === "leitura_sensor" || tipo === "entrega_registrada" || tipo === "alerta_ponto") carregar();
    });
    return parar;
  }, []);

  const bairros = terr.map((t) => ({ slug: t.slug, nome: t.bairro }));
  const i = ind?.indicadores;
  const m = ind?.metas;

  async function exportarCsv() {
    const s = lerSessao();
    const r = await fetch(`${API_URL}/gestao/exportar.csv`, { headers: { authorization: `Bearer ${s?.token}` } });
    const blob = new Blob([await r.text()], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `elo-territorio-${isoDiasAtras(0)}.csv`;
    a.click();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold text-brand-900">Gestão da rede</h1>
          <p className="text-texto-2">Onde a rede cidadã não está dando conta, e o que fazer?</p>
        </div>
        <Botao variante="secundario" onClick={exportarCsv}>⬇ Exportar CSV (prestação de contas)</Botao>
      </div>

      <Cartao>
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Filtros do dashboard" onSubmit={(e) => e.preventDefault()}>
          <Seletor rotulo="Período" valor={filtros.periodo} aoMudar={(v) => setFiltros({ ...filtros, periodo: v })}
            opcoes={[["30", "Últimos 30 dias"], ["90", "Últimos 90 dias"], ["180", "Últimos 6 meses"]]} />
          <Seletor rotulo="Bairro" valor={filtros.bairro} aoMudar={(v) => setFiltros({ ...filtros, bairro: v })}
            opcoes={[["", "Todos os bairros"], ...bairros.map((b) => [b.slug, b.nome] as [string, string])]} />
          <Seletor rotulo="Canal" valor={filtros.canal} aoMudar={(v) => setFiltros({ ...filtros, canal: v })}
            opcoes={[["", "Todos os canais"], ...Object.entries(CANAL)]} />
          <Seletor rotulo="Categoria" valor={filtros.categoria} aoMudar={(v) => setFiltros({ ...filtros, categoria: v })}
            opcoes={[["", "Todas as categorias"], ...Object.entries(CATEGORIA)]} />
          <Seletor rotulo="Faixa de risco" valor={filtros.faixa} aoMudar={(v) => setFiltros({ ...filtros, faixa: v })}
            opcoes={[["", "Todas as faixas"], ["verde", "Verde"], ["amarela", "Amarela"], ["vermelha", "Vermelha"]]} />
        </form>
      </Cartao>

      <div role="tablist" aria-label="Seções do dashboard" className="flex flex-wrap gap-2">
        {ABAS.map((a) => (
          <button key={a.id} role="tab" id={`aba-${a.id}`} aria-selected={aba === a.id} aria-controls={`painel-${a.id}`} onClick={() => setAba(a.id)}
            className={`min-h-12 rounded-full px-5 font-bold ${aba === a.id ? "bg-brand-900 text-white" : "bg-superficie text-brand-900 shadow-e1 hover:bg-brand-50"}`}>
            {a.rotulo}
          </button>
        ))}
      </div>

      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {!ind && !erro && <Carregando texto="Carregando indicadores…" />}

      <section role="tabpanel" id={`painel-${aba}`} aria-labelledby={`aba-${aba}`} className="flex flex-col gap-5">
        {aba === "geral" && i && m && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi titulo="Pedidos no período" valor={i.total_pedidos} formatado={num(i.total_pedidos)} ajuda={`${num(i.cidadaos_atendidos)} pessoas atendidas`} />
              <Kpi titulo="Absorção pela rede cidadã" valor={i.taxa_absorcao} formatado={pct(i.taxa_absorcao)} meta={m.taxa_absorcao} />
              <Kpi titulo="Escalados ao CRAS por falta de voluntário" valor={i.pct_escalado} formatado={pct(i.pct_escalado)} meta={m.pct_escalado} />
              <Kpi titulo="Tempo até a 1ª resposta" valor={i.horas_1a_resposta} formatado={`${num(i.horas_1a_resposta, 1)} h`} ajuda={`Faixa vermelha: ${num(i.horas_1a_resposta_vermelha, 1)} h`} />
            </div>
            <Grafico titulo="Pedidos por mês" descricao="Volume mensal de pedidos e variação em relação ao mês anterior."
              opcao={{ xAxis: { type: "category", data: mensal.map((x) => mesCurto(x.mes)) }, yAxis: { type: "value" }, series: [{ type: "bar", name: "Pedidos", data: mensal.map((x) => x.total), itemStyle: { borderRadius: [6, 6, 0, 0] } }] }}
              tabela={{ colunas: ["Mês", "Pedidos", "Variação"], linhas: mensal.map((x) => [mesCurto(x.mes), num(x.total), pct(x.variacao_pct)]) }} />
            <Grafico titulo="Pedidos por categoria e faixa" descricao="Quantos pedidos de cada tipo, separados pela faixa de risco da triagem."
              opcao={categoriasOpcao(cats)} tabela={{ colunas: ["Categoria", "Faixa", "Pedidos"], linhas: cats.map((c) => [CATEGORIA[c.categoria] ?? c.categoria, c.faixa, num(c.total)]) }} />
          </>
        )}

        {aba === "equidade" && i && m && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Kpi titulo="Pedidos fora do app" valor={i.pct_fora_do_app} formatado={pct(i.pct_fora_do_app)} meta={m.pct_fora_do_app}
                ajuda="Se quase tudo vier do app, a inclusão falhou: quem não tem smartphone não está sendo atendido." />
              <Kpi titulo="Pedidos com desfecho registrado" valor={i.pct_com_desfecho} formatado={pct(i.pct_com_desfecho)} meta={m.pct_com_desfecho} />
              <Kpi titulo="Voluntários ativos por 200 habitantes" valor={i.voluntarios_por_200_hab} formatado={num(i.voluntarios_por_200_hab, 2)} meta={m.voluntarios_por_200_hab} />
            </div>
            <Grafico titulo="Pedidos por canal, por semana" descricao="Por onde os cidadãos chegam ao ELO ao longo do tempo." opcao={canaisOpcao(canais)}
              tabela={{ colunas: ["Semana", "Canal", "Pedidos"], linhas: canais.map((c) => [new Date(c.semana + "T12:00:00").toLocaleDateString("pt-BR"), CANAL[c.canal] ?? c.canal, num(c.total)]) }} />
          </>
        )}

        {aba === "territorio" && (
          <>
            {terr[0] && (
              <Alerta tipo="risco">
                Bairro mais crítico: <strong>{terr[0].bairro}</strong>. {pct(terr[0].pct_escalado)} dos pedidos foram escalados ao CRAS e há só{" "}
                {num(terr[0].voluntarios_por_200_hab, 2)} voluntário ativo por 200 habitantes. Recomendação: campanha de recrutamento de voluntários neste bairro.
              </Alerta>
            )}
            <Grafico titulo="Escalonamento ao CRAS por bairro" descricao="Percentual dos pedidos que a rede não absorveu, comparado com a densidade de voluntários."
              opcao={{
                tooltip: { trigger: "axis" }, legend: { bottom: 0 },
                xAxis: { type: "category", data: terr.map((t) => t.bairro) },
                yAxis: [{ type: "value", name: "% escalado", axisLabel: { formatter: (v: number) => `${Math.round(v * 100)}%` } }, { type: "value", name: "vol./200 hab" }],
                series: [
                  { type: "bar", name: "% escalado ao CRAS", data: terr.map((t) => t.pct_escalado), itemStyle: { borderRadius: [6, 6, 0, 0] } },
                  { type: "line", name: "Voluntários por 200 hab.", yAxisIndex: 1, data: terr.map((t) => t.voluntarios_por_200_hab), symbolSize: 10 },
                ],
              }}
              tabela={{ colunas: ["Bairro", "Pedidos", "Por mil hab.", "% escalado", "Absorção", "Voluntários ativos", "Vol./200 hab."],
                linhas: terr.map((t) => [t.bairro, num(t.pedidos), num(t.pedidos_por_mil_hab, 1), pct(t.pct_escalado), pct(t.taxa_absorcao), num(t.voluntarios_ativos), num(t.voluntarios_por_200_hab, 2)]) }} />
          </>
        )}

        {aba === "pontos" && (
          <>
            <div aria-live="polite">{ultimoEvento && <Alerta tipo="ok">📟 {ultimoEvento}</Alerta>}</div>
            <div className="grid gap-4 md:grid-cols-3">
              {aoVivo.map((p) => {
                const prev = previsao.find((x) => x.ponto_coleta_id === p.id);
                return (
                  <Cartao key={p.id}>
                    <p className="text-sm font-bold text-texto-2">Ao vivo · {p.bairro}</p>
                    <h3 className="text-lg font-extrabold text-brand-900">{p.nome}</h3>
                    <p className="mt-2 text-3xl font-extrabold">{num(p.estoque_kg, 1)} kg</p>
                    <div className="my-2 h-3 overflow-hidden rounded-full bg-fundo" role="progressbar" aria-valuenow={p.ocupacao_pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Ocupação ${num(p.ocupacao_pct)}%`}>
                      <div className="h-full bg-brand-600" style={{ width: `${Math.min(100, p.ocupacao_pct)}%` }} />
                    </div>
                    <p className="text-sm text-texto-2">{num(p.ocupacao_pct)}% de {num(p.capacidade_kg)} kg · {p.temperatura_c !== null ? `${num(p.temperatura_c, 1)} °C` : "sem leitura"}</p>
                    {prev && <p className="mt-1 text-sm font-bold">Previsão: zera em ~{num(prev.dias_ate_zerar, 1)} dias (consumo médio {num(prev.consumo_medio_7d_kg, 1)} kg/dia)</p>}
                    {p.alertas.map((a) => <p key={a} className="mt-1 text-sm font-bold text-risco-vermelha">⚠ {a}</p>)}
                  </Cartao>
                );
              })}
            </div>
            <Grafico titulo="Entregas confirmadas: sensor x manual" descricao="Quantas entregas o Ponto de Coleta Inteligente confirmou sozinho."
              opcao={{ tooltip: { trigger: "item" }, legend: { bottom: 0 }, series: [{ type: "pie", radius: ["45%", "70%"], data: entregas.map((e) => ({ name: e.origem === "sensor" ? "Sensor (IoT)" : "Manual", value: e.entregas })) }] }}
              tabela={{ colunas: ["Origem", "Entregas", "Horas entre assumir e depositar"], linhas: entregas.map((e) => [e.origem === "sensor" ? "Sensor (IoT)" : "Manual", num(e.entregas), num(e.horas_ate_deposito, 1)]) }} />
          </>
        )}

        {aba === "ia" && ia && <AbaIa ia={ia} />}
      </section>
    </div>
  );
}

function AbaIa({ ia }: { ia: Ia }) {
  const linhas = Object.entries(ia.avaliacoes).filter(([, a]) => a) as [string, Avaliacao][];
  const nome: Record<string, string> = {
    treino_v1: "Treino · léxico v1", treino_offline: "Treino · offline", validacao_offline: "Validação · offline",
    treino_llm: "Treino · LLM", validacao_llm: "Validação · LLM",
  };
  const principal = ia.avaliacoes.validacao_llm ?? ia.avaliacoes.validacao_offline;
  return (
    <>
      {principal && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi titulo="Recall da faixa vermelha (validação)" valor={principal.recall_vermelha} formatado={pct(principal.recall_vermelha)}
            meta={{ valor: 1, sentido: "minimo", texto: "zero caso de risco sem detecção" }} />
          <Kpi titulo="Acurácia da faixa (validação)" valor={principal.acuracia} formatado={pct(principal.acuracia)} ajuda={principal.modelo} />
          <Kpi titulo="Falsos negativos de vermelha" valor={principal.falsos_negativos_vermelha} formatado={num(principal.falsos_negativos_vermelha)} />
          <Kpi titulo="Tempo médio por triagem" valor={principal.tempo_medio_ms} formatado={`${num(principal.tempo_medio_ms, 1)} ms`} ajuda="Triagem manual: minutos por relato" />
        </div>
      )}
      <Grafico titulo="Avaliações da triagem" descricao="Acurácia e recall da faixa vermelha em cada versão e conjunto. Validação = relatos nunca usados para ajustar regras."
        opcao={{ legend: { bottom: 0 }, xAxis: { type: "category", data: linhas.map(([k]) => nome[k] ?? k) }, yAxis: { type: "value", max: 1, axisLabel: { formatter: (v: number) => `${v * 100}%` } },
          series: [{ type: "bar", name: "Acurácia", data: linhas.map(([, a]) => a.acuracia) }, { type: "bar", name: "Recall da vermelha", data: linhas.map(([, a]) => a.recall_vermelha) }] }}
        tabela={{ colunas: ["Avaliação", "Modelo", "Casos", "Acurácia", "Recall vermelha", "Falsos negativos"], linhas: linhas.map(([k, a]) => [nome[k] ?? k, a.modelo, a.total, pct(a.acuracia), pct(a.recall_vermelha), a.falsos_negativos_vermelha]) }} />
      <Cartao>
        <h3 className="mb-2 text-lg font-extrabold text-brand-900">Como a triagem decidiu, no histórico</h3>
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-borda"><th scope="col" className="py-2">Origem da decisão</th><th scope="col">Faixa</th><th scope="col">Pedidos</th></tr></thead>
          <tbody>{ia.producao.map((p, i) => <tr key={i} className="border-b border-borda last:border-0"><td className="py-2">{p.origem_triagem}</td><td>{p.faixa}</td><td>{num(p.total)}</td></tr>)}</tbody>
        </table>
      </Cartao>
    </>
  );
}

function Seletor({ rotulo, valor, opcoes, aoMudar }: { rotulo: string; valor: string; opcoes: [string, string][]; aoMudar: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-bold text-texto-2">
      {rotulo}
      <select value={valor} onChange={(e) => aoMudar(e.target.value)} className="min-h-12 rounded-md border-2 border-borda bg-superficie px-3 text-base font-semibold text-texto">
        {opcoes.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
      </select>
    </label>
  );
}

function categoriasOpcao(cats: CategoriaLinha[]) {
  const categorias = [...new Set(cats.map((c) => c.categoria))];
  const faixas = ["verde", "amarela", "vermelha"];
  const cores: Record<string, string> = { verde: "#0f6b3d", amarela: "#e0a100", vermelha: "#a3171c" };
  return {
    legend: { bottom: 0 },
    xAxis: { type: "category" as const, data: categorias.map((c) => CATEGORIA[c] ?? c) },
    yAxis: { type: "value" as const },
    series: faixas.map((f) => ({
      type: "bar" as const, stack: "total", name: `Faixa ${f}`, itemStyle: { color: cores[f] },
      data: categorias.map((c) => cats.find((x) => x.categoria === c && x.faixa === f)?.total ?? 0),
    })),
  };
}

function canaisOpcao(canais: Canal[]) {
  const semanas = [...new Set(canais.map((c) => c.semana))];
  const tipos = [...new Set(canais.map((c) => c.canal))];
  return {
    legend: { bottom: 0 },
    xAxis: { type: "category" as const, data: semanas.map((s) => new Date(s + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })) },
    yAxis: { type: "value" as const },
    series: tipos.map((t) => ({ type: "line" as const, smooth: true, name: CANAL[t] ?? t, data: semanas.map((s) => canais.find((c) => c.semana === s && c.canal === t)?.total ?? 0) })),
  };
}
