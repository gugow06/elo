import { montarMensagemUsuario, PROMPT_SISTEMA } from './prompt';
import { CATEGORIAS, Categoria, ClassificadorModelo, Faixa, RespostaModelo } from './tipos';

export interface ConfigLlm {
  /** Endpoint compatível com /v1/chat/completions (provedor em nuvem ou servidor local). */
  url: string;
  apiKey?: string;
  modelo: string;
  timeoutMs?: number;
}

const FAIXAS: readonly Faixa[] = ['verde', 'amarela', 'vermelha'];

/** Extrai e valida o JSON da resposta do modelo. Lança erro se for inválido. */
export function interpretarResposta(conteudo: string): RespostaModelo {
  const bloco = conteudo.match(/\{[\s\S]*\}/);
  if (!bloco) throw new Error('Resposta do modelo sem JSON');
  const dado = JSON.parse(bloco[0]) as Record<string, unknown>;

  const faixa = dado.faixa as Faixa;
  const categoria = dado.categoria as Categoria;
  const confianca = Number(dado.confianca);
  if (!FAIXAS.includes(faixa)) throw new Error(`Faixa inválida: ${String(dado.faixa)}`);
  if (!CATEGORIAS.includes(categoria)) throw new Error(`Categoria inválida: ${String(dado.categoria)}`);
  if (!Number.isFinite(confianca) || confianca < 0 || confianca > 1) throw new Error('Confiança fora de 0..1');

  return { faixa, categoria, confianca, justificativa: String(dado.justificativa ?? '').slice(0, 300) };
}

/** Cliente para qualquer endpoint no formato /v1/chat/completions. */
export class ClassificadorLlm implements ClassificadorModelo {
  readonly externo = true;
  readonly nome: string;

  constructor(private readonly config: ConfigLlm) {
    this.nome = `llm:${config.modelo}`;
  }

  async classificar(relatoMinimizado: string): Promise<RespostaModelo> {
    const controle = new AbortController();
    const timer = setTimeout(() => controle.abort(), this.config.timeoutMs ?? 8000);
    try {
      const resposta = await fetch(this.config.url, {
        method: 'POST',
        signal: controle.signal,
        headers: {
          'content-type': 'application/json',
          ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.config.modelo,
          temperature: 0,
          messages: [
            { role: 'system', content: PROMPT_SISTEMA },
            { role: 'user', content: montarMensagemUsuario(relatoMinimizado) },
          ],
        }),
      });
      if (!resposta.ok) throw new Error(`LLM respondeu HTTP ${resposta.status}`);
      const corpo = (await resposta.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const conteudo = corpo.choices?.[0]?.message?.content;
      if (!conteudo) throw new Error('LLM sem conteúdo na resposta');
      return interpretarResposta(conteudo);
    } finally {
      clearTimeout(timer);
    }
  }
}
