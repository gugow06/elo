import { Provider } from '@nestjs/common';
import { classificadorDoAmbiente } from '@elo/triagem';

export const CLASSIFICADOR = Symbol('CLASSIFICADOR');

/** LLM se LLM_URL e LLM_MODELO estiverem definidos; senão, classificador offline. */
export const classificadorProvider: Provider = {
  provide: CLASSIFICADOR,
  useFactory: () => classificadorDoAmbiente(),
};
