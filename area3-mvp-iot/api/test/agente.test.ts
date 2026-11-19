import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth, criarApp, entrar, TELEFONES } from './helpers';

type Item = { id: string; descricao: string; status: string; quantidade: number; quem_leva: string[] };
type PedidoAgente = {
  id: string; protocolo: string; status: string; recebe_doacao: boolean; itens: Item[];
  ajudantes: { oferta_id: string; nome: string; itens: string[] }[];
  entregas: { origem: string; itens: { descricao: string; quantidade: number }[] }[];
};

describe('agente do ponto de coleta: registra pelo protocolo o que a pessoa trouxe', () => {
  let app: NestFastifyApplication;
  let agente: string;
  let ana: string;
  let claudia: string;
  let ponto: string;
  let protocolo: string;
  let pedidoId: string;

  const ver = async (p = protocolo, token = agente) => app.inject({ method: 'GET', url: `/agente/pedidos/${p}`, headers: auth(token) });
  const registrar = (corpo: unknown, p = protocolo) =>
    app.inject({ method: 'POST', url: `/agente/pedidos/${p}/entregas`, headers: auth(agente), payload: corpo as object });

  beforeAll(async () => {
    app = await criarApp();
    agente = await entrar(app, TELEFONES.agente);
    ana = await entrar(app, TELEFONES.ana);
    claudia = await entrar(app, TELEFONES.claudia);
    ponto = ((await app.inject({ method: 'GET', url: '/agente/pontos', headers: auth(agente) })).json() as { id: string }[])[0].id;
    const p = (await app.inject({ method: 'POST', url: '/solicitacoes', headers: auth(ana), payload: { relato: 'Preciso de arroz e feijão para a família esta semana.' } })).json();
    protocolo = p.protocolo;
    pedidoId = p.id;
  });
  afterAll(() => app.close());

  it('o agente entra no painel e vê os pontos de coleta do município', async () => {
    const r = await app.inject({ method: 'GET', url: '/agente/pontos', headers: auth(agente) });
    expect(r.statusCode).toBe(200);
    expect((r.json() as { nome: string }[]).length).toBeGreaterThan(0);
    // Cidadão não usa as telas do agente
    expect((await app.inject({ method: 'GET', url: '/agente/pontos', headers: auth(ana) })).statusCode).toBe(403);
  });

  it('pelo protocolo, vê os itens e quem combinou levar o quê (só primeiro nome, nada de quem pediu)', async () => {
    const r1 = await ver();
    const itens = (r1.json() as PedidoAgente).itens;
    await app.inject({ method: 'POST', url: `/mural/${pedidoId}/ofertas`, headers: auth(claudia), payload: { itens: [itens[0].id, itens[1].id] } });
    const p = (await ver()).json() as PedidoAgente & Record<string, unknown>;
    expect(p.recebe_doacao).toBe(true);
    expect(p.itens[0]).toEqual(expect.objectContaining({ descricao: 'Arroz', status: 'comprometido', quem_leva: ['Cláudia'], quantidade: 0 }));
    expect(p.ajudantes).toEqual([expect.objectContaining({ nome: 'Cláudia', itens: [itens[0].id, itens[1].id] })]);
    for (const proibido of ['relato', 'cidadao_id', 'nome', 'telefone', 'endereco']) expect(p).not.toHaveProperty(proibido);
  });

  it('protocolo errado ou de outro formato', async () => {
    expect((await ver('000000')).statusCode).toBe(404);
    expect((await ver('12ab')).statusCode).toBe(400);
  });

  it('protocolo de outra cidade: a mensagem diz de qual cidade é', async () => {
    const luiz = await entrar(app, '+5511990000008'); // mora em Campo Alegre do Norte
    const p = (await app.inject({ method: 'POST', url: '/solicitacoes', headers: auth(luiz), payload: { relato: 'Preciso de material escolar para o meu filho' } })).json();
    const r = await ver(p.protocolo);
    expect(r.statusCode).toBe(404);
    expect(r.json().message).toContain('Campo Alegre do Norte');
  });

  it('registra o que a pessoa trouxe, com quantidade, e avisa quem pediu e quem trouxe', async () => {
    const p = (await ver()).json() as PedidoAgente;
    const claudiaOferta = p.ajudantes[0].oferta_id;
    const r = await registrar({ ponto_coleta_id: ponto, oferta_id: claudiaOferta, itens: [{ item_id: p.itens[0].id, quantidade: 2 }, { item_id: p.itens[1].id, quantidade: 1 }] });
    expect(r.statusCode).toBe(201);
    const depois = r.json().pedido as PedidoAgente;
    expect(depois.itens[0]).toEqual(expect.objectContaining({ status: 'entregue', quantidade: 2 }));
    expect(depois.status).not.toBe('entregue'); // ainda faltam itens
    expect(depois.entregas[0]).toEqual(expect.objectContaining({ origem: 'painel', itens: [{ descricao: 'Arroz', quantidade: 2 }, { descricao: 'Feijão', quantidade: 1 }] }));

    const avisosAna = (await app.inject({ method: 'GET', url: '/notificacoes', headers: auth(ana) })).json() as { texto: string }[];
    expect(avisosAna.some((n) => n.texto.includes('Arroz (2), Feijão') && n.texto.includes(protocolo))).toBe(true);
    const avisosClaudia = (await app.inject({ method: 'GET', url: '/notificacoes', headers: auth(claudia) })).json() as { tipo: string }[];
    expect(avisosClaudia.some((n) => n.tipo === 'sua_ajuda_chegou')).toBe(true);

    // No app de quem pediu, o item aparece como "chegou ao ponto", com a quantidade, e a retirada é onde chegou
    const meu = ((await app.inject({ method: 'GET', url: '/solicitacoes/minhas', headers: auth(ana) })).json() as { id: string; itens: Item[]; ponto_coleta: string }[]).find((x) => x.id === pedidoId)!;
    expect(meu.itens[0]).toEqual(expect.objectContaining({ status: 'entregue', quantidade: 2 }));
    const nomePonto = ((await app.inject({ method: 'GET', url: '/agente/pontos', headers: auth(agente) })).json() as { id: string; nome: string }[]).find((x) => x.id === ponto)!.nome;
    expect(meu.ponto_coleta).toBe(nomePonto);
  });

  it('o mesmo item pode chegar de novo (comida, material escolar): a quantidade soma', async () => {
    const p = (await ver()).json() as PedidoAgente;
    const r = await registrar({ ponto_coleta_id: ponto, itens: [{ item_id: p.itens[0].id, quantidade: 3 }, { item_id: p.itens[0].id, quantidade: 1 }] });
    expect(r.statusCode).toBe(201);
    expect((r.json().pedido as PedidoAgente).itens[0].quantidade).toBe(6);
  });

  it('quem não está no app também pode trazer; com tudo no ponto, o pedido fica "pode retirar"', async () => {
    const p = (await ver()).json() as PedidoAgente;
    const faltam = p.itens.filter((i) => i.status !== 'entregue').map((i) => ({ item_id: i.id, quantidade: 1 }));
    const r = await registrar({ ponto_coleta_id: ponto, itens: faltam });
    expect(r.statusCode).toBe(201);
    expect((r.json().pedido as PedidoAgente).status).toBe('entregue');
    expect((r.json().pedido as PedidoAgente).recebe_doacao).toBe(true);
  });

  it('não aceita item de outro pedido, pessoa que não ajuda neste pedido nem lista vazia', async () => {
    const p = (await ver()).json() as PedidoAgente;
    expect((await registrar({ ponto_coleta_id: ponto, itens: [] })).statusCode).toBe(400);
    expect((await registrar({ ponto_coleta_id: ponto, itens: [{ item_id: '00000000-0000-4000-8000-000000000000', quantidade: 1 }] })).statusCode).toBe(400);
    const outraOferta = '00000000-0000-4000-8000-000000000001';
    expect((await registrar({ ponto_coleta_id: ponto, oferta_id: outraOferta, itens: [{ item_id: p.itens[0].id, quantidade: 1 }] })).statusCode).toBe(400);
  });

  it('depois que quem pediu encerra, o pedido não recebe mais doação', async () => {
    await app.inject({ method: 'POST', url: `/solicitacoes/${pedidoId}/encerrar`, headers: auth(ana) });
    const p = (await ver()).json() as PedidoAgente;
    expect(p.recebe_doacao).toBe(false);
    expect((await registrar({ ponto_coleta_id: ponto, itens: [{ item_id: p.itens[0].id, quantidade: 1 }] })).statusCode).toBe(400);
  });

  it('a gestão convida um agente pela Equipe', async () => {
    const gestor = await entrar(app, TELEFONES.gestor);
    const r = await app.inject({
      method: 'POST', url: '/gestao/equipe', headers: auth(gestor),
      payload: { nome: 'Paulo Agente', email: 'paulo.agente@example.com', telefone: '+5511990001234', perfil: 'agente' },
    });
    expect(r.statusCode).toBe(201);
    expect(r.json().perfil).toBe('agente');
  });
});
