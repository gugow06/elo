import { montarMensagemUsuario, PROMPT_SISTEMA } from './prompt';
import { CATEGORIAS, Categoria, ClassificadorModelo, Faixa, RespostaModelo } from './tipos';

export interface ConfigLlm {
  /** Endpoint compatível com /v1/chat/completions (provedor em nuvem ou servidor local). */
  url: string;
  apiKey?: string;
  modelo: string;
  /** Tempo máximo de cada tentativa. Padrão 20 s. */
  timeoutMs?: number;
  /** Novas tentativas em HTTP 429/5xx ou timeout. Padrão 2. */
  tentativas?: number;
  /** Enviado como reasoning_effort quando definido (ex.: "none" para respostas rápidas). */
  esforcoRaciocinio?: string;
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

class ErroTransitorio extends Error {}

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
    const tentativas = this.config.tentativas ?? 2;
    let ultimoErro: Error = new Error('sem tentativas');
    for (let i = 0; i <= tentativas; i++) {
      if (i > 0) await espera(1000 * 2 ** (i - 1)); // 1 s, 2 s...
      try {
        return await this.tentar(relatoMinimizado);
      } catch (erro) {
        ultimoErro = erro as Error;
        if (!(erro instanceof ErroTransitorio)) throw erro;
      }
    }
    throw ultimoErro;
  }

  private async tentar(relatoMinimizado: string): Promise<RespostaModelo> {
    const controle = new AbortController();
    const timer = setTimeout(() => controle.abort(), this.config.timeoutMs ?? 20000);
    try {
      let resposta: Response;
      try {
        resposta = await fetch(this.config.url, {
          method: 'POST',
          signal: controle.signal,
          headers: {
            'content-type': 'application/json',
            ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}),
          },
          body: JSON.stringify({
            model: this.config.modelo,
            temperature: 0,
            ...(this.config.esforcoRaciocinio ? { reasoning_effort: this.config.esforcoRaciocinio } : {}),
            messages: [
              { role: 'system', content: PROMPT_SISTEMA },
              { role: 'user', content: montarMensagemUsuario(relatoMinimizado) },
            ],
          }),
        });
      } catch (erro) {
        throw new ErroTransitorio(`falha de rede ou timeout (${(erro as Error).message})`);
      }
      if (resposta.status === 429 || resposta.status >= 500) throw new ErroTransitorio(`LLM respondeu HTTP ${resposta.status}`);
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
