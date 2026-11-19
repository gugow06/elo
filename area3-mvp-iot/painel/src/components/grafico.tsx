"use client";

import type { EChartsOption } from "echarts";
import { useEffect, useId, useRef, useState } from "react";
import { Botao, Cartao } from "./ui";

export const PALETA = ["#006b52", "#1d5fbf", "#b4560a", "#6b3fb5", "#a3171c", "#4a5a53"];

/**
 * Gráfico ECharts com alternativa em tabela (RNF-A10: toda visualização tem equivalente textual).
 * `tabela` recebe as mesmas linhas mostradas no gráfico.
 */
export function Grafico({
  titulo,
  descricao,
  opcao,
  tabela,
  altura = 300,
}: {
  titulo: string;
  descricao: string;
  opcao: EChartsOption;
  tabela: { colunas: string[]; linhas: (string | number)[][] };
  altura?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [comoTabela, setComoTabela] = useState(false);
  const idDesc = useId();

  useEffect(() => {
    if (comoTabela || !ref.current) return;
    let grafico: import("echarts").ECharts | undefined;
    let ativo = true;
    const aoRedimensionar = () => grafico?.resize();
    import("echarts").then((echarts) => {
      if (!ativo || !ref.current) return;
      grafico = echarts.init(ref.current, undefined, { renderer: "svg" });
      grafico.setOption({
        color: PALETA,
        textStyle: { fontFamily: "inherit", color: "#14231d" },
        aria: { enabled: true, label: { description: `${titulo}. ${descricao}` } },
        grid: { left: 48, right: 16, top: 32, bottom: 40, containLabel: true },
        tooltip: { trigger: "axis" },
        ...opcao,
      });
      window.addEventListener("resize", aoRedimensionar);
    });
    return () => {
      ativo = false;
      window.removeEventListener("resize", aoRedimensionar);
      grafico?.dispose();
    };
  }, [opcao, comoTabela, titulo, descricao]);

  return (
    <Cartao>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-extrabold text-brand-900">{titulo}</h3>
          <p id={idDesc} className="text-sm text-texto-2">
            {descricao}
          </p>
        </div>
        <Botao variante="secundario" className="min-h-10 px-4 text-sm" aria-pressed={comoTabela} onClick={() => setComoTabela((v) => !v)}>
          {comoTabela ? "Ver como gráfico" : "Ver como tabela"}
        </Botao>
      </div>
      {comoTabela ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{titulo}</caption>
            <thead>
              <tr className="border-b border-borda">
                {tabela.colunas.map((c) => (
                  <th key={c} scope="col" className="px-2 py-2 font-bold text-texto-2">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tabela.linhas.map((l, i) => (
                <tr key={i} className="border-b border-borda last:border-0">
                  {l.map((v, j) => (
                    <td key={j} className="px-2 py-2">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={ref} role="img" aria-describedby={idDesc} aria-label={titulo} style={{ height: altura }} />
      )}
    </Cartao>
  );
}
