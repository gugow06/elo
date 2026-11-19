export type Faixa = 'verde' | 'amarela' | 'vermelha';

export type Categoria =
  | 'alimento'
  | 'roupa'
  | 'movel'
  | 'material_escolar'
  | 'apoio_idoso'
  | 'transporte'
  | 'outro';

export const CATEGORIAS: readonly Categoria[] = [
  'alimento',
  'roupa',
  'movel',
  'material_escolar',
  'apoio_idoso',
  'transporte',
  'outro',
];

/** De onde veio a decisão final. */
export type OrigemClassificacao =
  | 'regra' //     regra determinística de risco (o LLM nem é chamado)
  | 'llm' //       modelo de linguagem, acima do limiar de confiança
  | 'offline' //   classificador por palavras-chave, usado quando não há LLM configurado
  | 'fallback'; // falha, timeout ou confiança baixa: vai para vermelha por segurança

export interface Classificacao {
  faixa: Faixa;
  categoria: Categoria;
  /** 0 a 1. Em regra determinística é sempre 1. */
  confianca: number;
  origem: OrigemClassificacao;
  /** Id da regra determinística que disparou, quando houver. */
  regra?: string;
  justificativa: string;
  /** Tempo total da triagem, em milissegundos. */
  duracaoMs: number;
  /** Se o texto foi enviado a um modelo externo. */
  chamouLlm: boolean;
}

/** Resposta esperada do modelo (antes da validação). */
export interface RespostaModelo {
  faixa: Faixa;
  categoria: Categoria;
  confianca: number;
  justificativa: string;
}

/** Qualquer classificador de linguagem (LLM remoto, local ou offline). */
export interface ClassificadorModelo {
  readonly nome: string;
  readonly externo: boolean;
  classificar(relatoMinimizado: string): Promise<RespostaModelo>;
}
