import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth, criarApp, entrar, TELEFONES } from './helpers';

const ROBERTO = '+5511990000005';

type Item = { id: string; descricao: string; status: 'aberto' | 'comprometido' | 'obtido'; meu: boolean };
type Pedido = { id: string; status: string; itens: Item[]; pessoas_ajudando: number };

describe('pedido com itens: várias pessoas ajudando e checklist de quem pediu', () => {
  let app: NestFastifyApplication;
  let ana: string;
  let claudia: string;
  let roberto: string;
  let pedidoId: string;

  const doMural = async (token: string) => {
    const r = await app.inject({ method: 'GET', url: '/mural?ordem=recentes', headers: auth(token) });
    return (r.json() as Pedido[]).find((p) => p.id === pedidoId);
  };
  const meu = async () => {
    const r = await app.inject({ method: 'GET', url: '/solicitacoes/minhas', headers: auth(ana) });
    return (r.json() as Pedido[]).find((p) => p.id === pedidoId)!;
  };
  const ajudar = (token: string, itens?: string[]) =>
    app.inject({ method: 'POST', url: `/mural/${pedidoId}/ofertas`, headers: auth(token), payload: itens ? { itens } : {} });

  beforeAll(async () => {
    app = await criarApp();
    ana = await entrar(app, TELEFONES.ana);
    claudia = await entrar(app, TELEFONES.claudia);
    roberto = await entrar(app, ROBERTO);
    const r = await app.inject({
      method: 'POST', url: '/solicitacoes', headers: auth(ana),
      payload: { relato: 'Perdi o emprego e preciso de uma cesta básica para meus dois filhos' },
    });
    pedidoId = r.json().id;
  });
  afterAll(async () => {
    await app.close();
  });

  it('o pedido nasce com os itens da categoria, todos abertos', async () => {
    const p = await doMural(claudia);
    expect(p?.itens.map((i) => i.descricao)).toEqual(['Arroz', 'Feijão', 'Óleo', 'Leite', 'Itens de higiene básica']);
    expect(p?.itens.every((i) => i.status === 'aberto' && !i.meu)).toBe(true);
    expect(p?.pessoas_ajudando).toBe(0);
  });

  it('os pedidos do seed também têm itens', async () => {
    const r = await app.inject({ method: 'GET', url: '/mural', headers: auth(claudia) });
    expect((r.json() as Pedido[]).every((p) => p.itens.length > 0)).toBe(true);
  });

  it('uma pessoa escolhe itens e o pedido continua no mural para os outros', async () => {
    const { itens } = (await doMural(claudia))!;
    const r = await ajudar(claudia, [itens[0].id, itens[1].id]);
    expect(r.statusCode).toBe(201);
    expect(r.json().itens).toEqual(['Arroz', 'Feijão']);
    const visto = (await doMural(roberto))!;
    expect(visto.pessoas_ajudando).toBe(1);
    expect(visto.itens.filter((i) => i.status === 'comprometido').map((i) => i.descricao)).toEqual(['Arroz', 'Feijão']);
    expect(visto.itens.some((i) => i.meu)).toBe(false);
    expect((await doMural(claudia))!.itens.filter((i) => i.meu)).toHaveLength(2);
  });

  it('não dá para escolher item que outra pessoa já vai levar', async () => {
    const { itens } = (await doMural(roberto))!;
    const r = await ajudar(roberto, [itens[0].id]);
    expect(r.statusCode).toBe(409);
  });

  it('quando ninguém mais precisa escolher, o pedido sai do mural', async () => {
    const r = await ajudar(roberto);
    expect(r.json().itens).toEqual(['Óleo', 'Leite', 'Itens de higiene básica']);
    expect(await doMural(claudia)).toBeUndefined();
    const p = await meu();
    expect(p.status).toBe('em_atendimento');
    expect(p.pessoas_ajudando).toBe(2);
  });

  it('cada pessoa vê em "Minhas ajudas" os itens que vai levar', async () => {
    const r = await app.inject({ method: 'GET', url: '/voluntario/ofertas', headers: auth(roberto) });
    const ajuda = r.json().find((o: { solicitacao_id: string }) => o.solicitacao_id === pedidoId);
    expect(ajuda.itens.filter((i: Item) => i.meu).map((i: Item) => i.descricao)).toEqual(['Óleo', 'Leite', 'Itens de higiene básica']);
  });

  it('só quem pediu marca o que recebeu; com tudo marcado, conclui e avisa todo mundo', async () => {
    const { itens } = await meu();
    const outro = await app.inject({ method: 'PATCH', url: `/solicitacoes/${pedidoId}/itens/${itens[0].id}`, headers: auth(claudia), payload: { obtido: true } });
    expect(outro.statusCode).toBe(404);

    // marcar e desmarcar
    await app.inject({ method: 'PATCH', url: `/solicitacoes/${pedidoId}/itens/${itens[0].id}`, headers: auth(ana), payload: { obtido: true } });
    const desfeito = await app.inject({ method: 'PATCH', url: `/solicitacoes/${pedidoId}/itens/${itens[0].id}`, headers: auth(ana), payload: { obtido: false } });
    expect(desfeito.json().itens[0].status).toBe('comprometido');

    let ultimo;
    for (const i of itens) {
      ultimo = await app.inject({ method: 'PATCH', url: `/solicitacoes/${pedidoId}/itens/${i.id}`, headers: auth(ana), payload: { obtido: true } });
    }
    expect(ultimo!.json()).toEqual(expect.objectContaining({ concluido: true, status: 'concluida' }));
    for (const token of [claudia, roberto]) {
      const n = await app.inject({ method: 'GET', url: '/notificacoes', headers: auth(token) });
      expect(n.json().some((x: { tipo: string; solicitacao_id: string }) => x.tipo === 'sua_ajuda_chegou' && x.solicitacao_id === pedidoId)).toBe(true);
    }
    const encerrado = await app.inject({ method: 'PATCH', url: `/solicitacoes/${pedidoId}/itens/${itens[0].id}`, headers: auth(ana), payload: { obtido: false } });
    expect(encerrado.statusCode).toBe(400);
  });

  it('móvel continua com uma pessoa só', async () => {
    const r = await app.inject({
      method: 'POST', url: '/solicitacoes', headers: auth(ana),
      payload: { relato: 'Preciso de um sofá ou de uma cama, estou dormindo no chão' },
    });
    const movel = r.json().id;
    const cat = await app.inject({ method: 'GET', url: '/solicitacoes/minhas', headers: auth(ana) });
    const p = cat.json().find((x: { id: string }) => x.id === movel);
    if (p.categoria !== 'movel' || p.status !== 'no_mural') return; // a triagem decide a categoria; só vale se cair em móvel no mural
    expect((await app.inject({ method: 'POST', url: `/mural/${movel}/ofertas`, headers: auth(claudia), payload: { itens: [p.itens[0].id] } })).statusCode).toBe(201);
    expect((await app.inject({ method: 'POST', url: `/mural/${movel}/ofertas`, headers: auth(roberto), payload: {} })).statusCode).toBe(404);
  });
});
