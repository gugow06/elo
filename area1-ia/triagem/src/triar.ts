import { minimizar } from './minimizar';
import { ClassificadorOffline } from './offline';
import { aplicarRegras } from './regras';
import { Classificacao, ClassificadorModelo } from './tipos';

export interface OpcoesTriagem {
  /** Modelo a usar depois das regras. Padrão: classificador offline. */
  modelo?: ClassificadorModelo;
  /** Abaixo deste valor a solicitação vai para vermelha (RF-303). Padrão 0,75. */
  limiarConfianca?: number;
}

/**
 * Triagem de risco do ELO.
 *
 * 1. Regras determinísticas: qualquer acerto força VERMELHA sem consultar modelo (RT-03).
 * 2. Minimização: dados pessoais são removidos antes de qualquer modelo.
 * 3. Modelo: faixa + categoria + confiança.
 * 4. Confiança abaixo do limiar => VERMELHA (RT-02, princípio P2).
 * 5. Qualquer erro ou timeout do modelo => VERMELHA (RNF-O04). Nada é descartado.
 */
export async function triar(relato: string, opcoes: OpcoesTriagem = {}): Promise<Classificacao> {
  const inicio = performance.now();
  const ms = () => Math.round(performance.now() - inicio);
  const limiar = opcoes.limiarConfianca ?? 0.75;
  const modelo = opcoes.modelo ?? new ClassificadorOffline();

  const acerto = aplicarRegras(relato);
  if (acerto) {
    return {
      faixa: 'vermelha',
      categoria: 'outro',
      confianca: 1,
      origem: 'regra',
      regra: acerto.regra.id,
      justificativa: `${acerto.regra.motivo} (regra determinística).`,
      duracaoMs: ms(),
      chamouLlm: false,
    };
  }

  try {
    const resposta = await modelo.classificar(minimizar(relato));
    if (resposta.confianca < limiar) {
      return {
        faixa: 'vermelha',
        categoria: resposta.categoria,
        confianca: resposta.confianca,
        origem: 'fallback',
        justificativa: `Confiança ${resposta.confianca.toFixed(2)} abaixo do limiar ${limiar.toFixed(2)}: encaminhado ao técnico por segurança.`,
        duracaoMs: ms(),
        chamouLlm: modelo.externo,
      };
    }
    return {
      faixa: resposta.faixa,
      categoria: resposta.categoria,
      confianca: resposta.confianca,
      origem: modelo.externo ? 'llm' : 'offline',
      justificativa: resposta.justificativa,
      duracaoMs: ms(),
      chamouLlm: modelo.externo,
    };
  } catch (erro) {
    return {
      faixa: 'vermelha',
      categoria: 'outro',
      confianca: 0,
      origem: 'fallback',
      justificativa: `Classificador indisponível (${(erro as Error).message}): encaminhado ao técnico por segurança.`,
      duracaoMs: ms(),
      chamouLlm: modelo.externo,
    };
  }
}
