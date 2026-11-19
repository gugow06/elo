/**
 * Avaliação da triagem sobre o conjunto rotulado (avaliacao/relatos.csv).
 *
 *   pnpm --filter @elo/triagem avaliar            # classificador offline
 *   LLM_URL=... LLM_MODELO=... pnpm ... avaliar   # com LLM
 *
 * Gera avaliacao/resultado.json e avaliacao/resultado.md (evidência para o PDF).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { classificadorDoAmbiente, Faixa, triar, VERSAO_LEXICO } from '../src';

export interface CasoRotulado {
  id: number;
  relato: string;
  faixa: Faixa;
  categoria: string;
}

export function lerConjunto(caminho = join(__dirname, 'relatos.csv')): CasoRotulado[] {
  return readFileSync(caminho, 'utf8')
    .split(/\r?\n/)
    .slice(1)
    .filter((l) => l.trim())
    .map((linha) => {
      const [id, relato, faixa, categoria] = linha.split(';');
      return { id: Number(id), relato, faixa: faixa as Faixa, categoria };
    });
}

const FAIXAS: Faixa[] = ['verde', 'amarela', 'vermelha'];

export async function avaliar(casos: CasoRotulado[], limiar = Number(process.env.LLM_LIMIAR_CONFIANCA ?? 0.75)) {
  const modelo = classificadorDoAmbiente();
  const matriz: Record<Faixa, Record<Faixa, number>> = {
    verde: { verde: 0, amarela: 0, vermelha: 0 },
    amarela: { verde: 0, amarela: 0, vermelha: 0 },
    vermelha: { verde: 0, amarela: 0, vermelha: 0 },
  };
  const detalhes = [];
  let somaMs = 0;
  let porRegra = 0;
  let categoriaCerta = 0;
  let categoriaAvaliada = 0;

  for (const caso of casos) {
    const r = await triar(caso.relato, { modelo, limiarConfianca: limiar });
    matriz[caso.faixa][r.faixa] += 1;
    somaMs += r.duracaoMs;
    if (r.origem === 'regra') porRegra += 1;
    if (caso.faixa !== 'vermelha' && r.faixa === caso.faixa) {
      categoriaAvaliada += 1;
      if (r.categoria === caso.categoria) categoriaCerta += 1;
    }
    detalhes.push({
      id: caso.id,
      relato: caso.relato,
      esperado: caso.faixa,
      obtido: r.faixa,
      origem: r.origem,
      regra: r.regra ?? null,
      confianca: r.confianca,
      acerto: r.faixa === caso.faixa,
    });
  }

  const total = casos.length;
  const acertos = FAIXAS.reduce((s, f) => s + matriz[f][f], 0);
  const vermelhasReais = FAIXAS.reduce((s, f) => s + matriz.vermelha[f], 0);
  const preditasVermelhas = FAIXAS.reduce((s, f) => s + matriz[f].vermelha, 0);

  return {
    modelo: modelo.nome,
    versao_lexico: VERSAO_LEXICO,
    limiar_confianca: limiar,
    total,
    acuracia: acertos / total,
    recall_vermelha: matriz.vermelha.vermelha / vermelhasReais,
    precisao_vermelha: matriz.vermelha.vermelha / preditasVermelhas,
    falsos_negativos_vermelha: vermelhasReais - matriz.vermelha.vermelha,
    acuracia_categoria: categoriaAvaliada ? categoriaCerta / categoriaAvaliada : null,
    pct_decidido_por_regra: porRegra / total,
    tempo_medio_ms: somaMs / total,
    matriz_confusao: matriz,
    erros: detalhes.filter((d) => !d.acerto),
    detalhes,
  };
}

function pct(x: number | null) {
  return x === null ? '—' : `${(x * 100).toFixed(1)}%`;
}

function relatorio(r: Awaited<ReturnType<typeof avaliar>>): string {
  const m = r.matriz_confusao;
  const linhas = [
    '# Avaliação da triagem de risco',
    '',
    `- Classificador após as regras: \`${r.modelo}\``,
    `- Versão do léxico: \`${r.versao_lexico}\` · limiar de confiança: ${r.limiar_confianca}`,
    `- Casos: ${r.total}`,
    '',
    '| Métrica | Valor |',
    '| --- | --- |',
    `| Acurácia da faixa | ${pct(r.acuracia)} |`,
    `| **Recall da faixa vermelha** (meta 100%) | **${pct(r.recall_vermelha)}** |`,
    `| Falsos negativos de vermelha | ${r.falsos_negativos_vermelha} |`,
    `| Precisão da faixa vermelha | ${pct(r.precisao_vermelha)} |`,
    `| Acurácia da categoria (verde/amarela corretas) | ${pct(r.acuracia_categoria)} |`,
    `| Decididos por regra determinística | ${pct(r.pct_decidido_por_regra)} |`,
    `| Tempo médio por triagem | ${r.tempo_medio_ms.toFixed(2)} ms |`,
    '',
    '## Matriz de confusão (linha = esperado, coluna = obtido)',
    '',
    '| | verde | amarela | vermelha |',
    '| --- | --- | --- | --- |',
    ...FAIXAS.map((f) => `| **${f}** | ${m[f].verde} | ${m[f].amarela} | ${m[f].vermelha} |`),
    '',
    '## Erros',
    '',
    r.erros.length ? '| # | Relato | Esperado | Obtido | Origem |' : 'Nenhum.',
    ...(r.erros.length ? ['| --- | --- | --- | --- | --- |'] : []),
    ...r.erros.map((e) => `| ${e.id} | ${e.relato} | ${e.esperado} | ${e.obtido} | ${e.origem} |`),
    '',
  ];
  return linhas.join('\n');
}

if (require.main === module) {
  // Uso: avaliar.ts [treino|validacao]. "validacao" é o conjunto separado, nunca usado para ajustar o léxico.
  const conjunto = process.argv[2] === 'validacao' ? 'validacao' : 'treino';
  const arquivo = conjunto === 'validacao' ? 'relatos-validacao.csv' : 'relatos.csv';
  avaliar(lerConjunto(join(__dirname, arquivo))).then((r) => {
    const sufixo = conjunto === 'validacao' ? '-validacao' : '';
    writeFileSync(join(__dirname, `resultado${sufixo}.json`), JSON.stringify(r, null, 2));
    writeFileSync(join(__dirname, `resultado${sufixo}.md`), relatorio(r).replace('# Avaliação', `# Avaliação (${conjunto})`));
    console.log(relatorio(r));
  });
}
