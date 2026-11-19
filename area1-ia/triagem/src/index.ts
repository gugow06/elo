export * from './tipos';
export { normalizar } from './normalizar';
export { minimizar } from './minimizar';
export { aplicarRegras, REGRAS, VERSAO_LEXICO } from './regras';
export { ClassificadorOffline } from './offline';
export { ClassificadorLlm, interpretarResposta } from './llm';
export type { ConfigLlm } from './llm';
export { PROMPT_SISTEMA } from './prompt';
export { triar } from './triar';
export type { OpcoesTriagem } from './triar';

import { ClassificadorLlm } from './llm';
import { ClassificadorOffline } from './offline';
import { ClassificadorModelo } from './tipos';

/** Monta o classificador a partir das variáveis de ambiente (LLM_URL, LLM_API_KEY, LLM_MODELO). */
export function classificadorDoAmbiente(env: NodeJS.ProcessEnv = process.env): ClassificadorModelo {
  if (env.LLM_URL && env.LLM_MODELO) {
    return new ClassificadorLlm({ url: env.LLM_URL, apiKey: env.LLM_API_KEY || undefined, modelo: env.LLM_MODELO });
  }
  return new ClassificadorOffline();
}
