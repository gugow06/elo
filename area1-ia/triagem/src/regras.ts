import lexico from './lexico.json';
import { normalizar } from './normalizar';

export interface RegraRisco {
  id: string;
  motivo: string;
  padrao: RegExp;
}

export const VERSAO_LEXICO: string = lexico.versao;

export const REGRAS: readonly RegraRisco[] = lexico.regras.map((r) => ({
  id: r.id,
  motivo: r.motivo,
  padrao: new RegExp(r.padrao, 'i'),
}));

export interface AcertoRegra {
  regra: RegraRisco;
  trecho: string;
}

/**
 * Regras determinísticas de faixa vermelha (RT-03 / RF-302).
 * Retorna a primeira regra que bate, ou null. Não depende de nenhum modelo.
 */
export function aplicarRegras(relato: string): AcertoRegra | null {
  const texto = normalizar(relato);
  for (const regra of REGRAS) {
    const m = regra.padrao.exec(texto);
    if (m) return { regra, trecho: m[0] };
  }
  return null;
}
