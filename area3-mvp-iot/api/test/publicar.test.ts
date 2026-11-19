import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth, criarApp, entrar, TELEFONES } from './helpers';

describe('qualquer usuário do app pede e oferece ajuda', () => {
  let app: NestFastifyApplication;
  let ana: string;
  let claudia: string;
  let pedidoDaClaudia: string;

  beforeAll(async () => {
    app = await criarApp();
    ana = await entrar(app, TELEFONES.ana);
    claudia = await entrar(app, TELEFONES.claudia);
  });
  afterAll(async () => {
    await app?.close();
  });

  it('voluntária também publica um pedido de ajuda', async () => {
    const r = await app.inject({
      method: 'POST', url: '/solicitacoes', headers: auth(claudia),
      payload: { relato: 'Preciso de roupas de frio para meus filhos' },
    });
    expect(r.statusCode).toBe(201);
    pedidoDaClaudia = r.json().id;
    const minhas = await app.inject({ method: 'GET', url: '/solicitacoes/minhas', headers: auth(claudia) });
    expect(minhas.json().some((p: { id: string }) => p.id === pedidoDaClaudia)).toBe(true);
  });

  it('o próprio pedido não aparece no mural de quem pediu', async () => {
    const r = await app.inject({ method: 'GET', url: '/mural', headers: auth(claudia) });
    expect(r.json().some((p: { id: string }) => p.id === pedidoDaClaudia)).toBe(false);
  });

  it('ninguém assume o próprio pedido', async () => {
    const r = await app.inject({ method: 'POST', url: `/mural/${pedidoDaClaudia}/ofertas`, headers: auth(claudia) });
    expect(r.statusCode).toBe(400);
  });

  it('cidadã assume o pedido de outra pessoa e vê em "Minhas ajudas"', async () => {
    const mural = await app.inject({ method: 'GET', url: '/mural', headers: auth(ana) });
    expect(mural.json().some((p: { id: string }) => p.id === pedidoDaClaudia)).toBe(true);
    const r = await app.inject({ method: 'POST', url: `/mural/${pedidoDaClaudia}/ofertas`, headers: auth(ana) });
    expect(r.statusCode).toBe(201);
    const ajudas = await app.inject({ method: 'GET', url: '/voluntario/ofertas', headers: auth(ana) });
    expect(ajudas.json().some((o: { solicitacao_id: string }) => o.solicitacao_id === pedidoDaClaudia)).toBe(true);
  });
});
