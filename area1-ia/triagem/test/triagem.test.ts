import { describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import {
  aplicarRegras,
  ClassificadorModelo,
  interpretarResposta,
  minimizar,
  normalizar,
  RespostaModelo,
  triar,
} from '../src';
import { avaliar, lerConjunto } from '../avaliacao/avaliar';

/** Modelo falso que registra se foi chamado. */
function modeloFalso(resposta: RespostaModelo | Error): ClassificadorModelo & { chamadas: string[] } {
  const chamadas: string[] = [];
  return {
    nome: 'falso',
    externo: true,
    chamadas,
    async classificar(texto: string) {
      chamadas.push(texto);
      if (resposta instanceof Error) throw resposta;
      return resposta;
    },
  };
}

describe('normalizar', () => {
  it('remove acentos, baixa caixa e expande abreviações', () => {
    expect(normalizar('Vc  TÁ   precisando?')).toBe('voce esta precisando?');
  });
});

describe('T1: regra determinística de violência', () => {
  it('força VERMELHA sem chamar o modelo', async () => {
    const modelo = modeloFalso({ faixa: 'verde', categoria: 'alimento', confianca: 0.99, justificativa: '' });
    const r = await triar('Meu marido me bate quando bebe', { modelo });
    expect(r.faixa).toBe('vermelha');
    expect(r.origem).toBe('regra');
    expect(r.regra).toBe('violencia_fisica');
    expect(modelo.chamadas).toHaveLength(0);
    expect(r.chamouLlm).toBe(false);
  });

  it('não confunde palavras parecidas (armário não é arma)', () => {
    expect(aplicarRegras('Preciso de um armário para as roupas')).toBeNull();
  });
});

describe('T2: falha segura do classificador', () => {
  it('erro do modelo ⇒ VERMELHA (fila do técnico)', async () => {
    const r = await triar('Preciso de cesta básica', { modelo: modeloFalso(new Error('timeout')) });
    expect(r.faixa).toBe('vermelha');
    expect(r.origem).toBe('fallback');
  });

  it('confiança abaixo do limiar ⇒ VERMELHA', async () => {
    const modelo = modeloFalso({ faixa: 'verde', categoria: 'alimento', confianca: 0.5, justificativa: '' });
    const r = await triar('Preciso de cesta básica', { modelo, limiarConfianca: 0.75 });
    expect(r.faixa).toBe('vermelha');
    expect(r.origem).toBe('fallback');
  });

  it('resposta válida do modelo acima do limiar é aceita', async () => {
    const modelo = modeloFalso({ faixa: 'verde', categoria: 'alimento', confianca: 0.9, justificativa: 'ok' });
    const r = await triar('Preciso de cesta básica', { modelo });
    expect(r).toMatchObject({ faixa: 'verde', categoria: 'alimento', origem: 'llm', chamouLlm: true });
  });

  it('JSON inválido do modelo é rejeitado', () => {
    expect(() => interpretarResposta('{"faixa":"roxa","categoria":"alimento","confianca":0.9}')).toThrow();
    expect(() => interpretarResposta('sem json')).toThrow();
  });
});

describe('minimização antes do modelo', () => {
  it('remove CPF, telefone, e-mail e nome', () => {
    const t = minimizar('Meu nome é Ana Paula, CPF 123.456.789-09, tel (11) 98888-7777, ana@x.com');
    expect(t).not.toMatch(/123\.456|98888|ana@x|Ana Paula/);
  });

  it('o texto enviado ao modelo já está minimizado', async () => {
    const modelo = modeloFalso({ faixa: 'verde', categoria: 'alimento', confianca: 0.9, justificativa: '' });
    await triar('Me chamo Ana Paula, meu CPF é 12345678909, preciso de cesta básica', { modelo });
    expect(modelo.chamadas[0]).not.toMatch(/Ana Paula|12345678909/);
  });
});

describe('T3: avaliação nos conjuntos rotulados', () => {
  it('recall da faixa vermelha é 100% no conjunto de treino', async () => {
    const r = await avaliar(lerConjunto());
    expect(r.falsos_negativos_vermelha).toBe(0);
  });

  it('recall da faixa vermelha é 100% no conjunto de validação (não usado para ajustar regras)', async () => {
    const r = await avaliar(lerConjunto(join(__dirname, '../avaliacao/relatos-validacao.csv')));
    expect(r.falsos_negativos_vermelha).toBe(0);
  });
});

vi.setConfig({ testTimeout: 10000 });
