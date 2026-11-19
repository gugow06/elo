import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CHAVES_DEMO, PONTOS_DEMO } from '../db/seed';
import { SlaService } from '../src/rede/sla.service';
import { auth, criarApp, entrar, TELEFONES } from './helpers';

type Item = { id: string; descricao: string; status: string };
type PedidoAgente = { status: string; pode_retirar: boolean; itens: Item[]; retiradas: { origem: string; itens: string[] }[] };

const PONTO = PONTOS_DEMO['ponto-jardim'];
const CHAVE = CHAVES_DEMO['ponto-jardim'];

describe('retirada da doação: protocolo + código que só quem pediu tem', () => {
  let app: NestFastifyApplication;
  let pool: Pool;
  let agente: string;
  let ana: string;
  let claudia: string;

  const publicar = async () =>
    (await app.inject({ method: 'POST', url: '/solicitacoes', headers: auth(ana), payload: { relato: 'Preciso de arroz e feijão para a família esta semana.' } })).json() as {
      id: string; protocolo: string; codigo_retirada: string; mensagem: string;
    };
  const ver = async (protocolo: string) => (await app.inject({ method: 'GET', url: `/agente/pedidos/${protocolo}`, headers: auth(agente) })).json() as PedidoAgente;
  const entregar = (protocolo: string, itens: string[]) =>
    app.inject({ method: 'POST', url: `/agente/pedidos/${protocolo}/entregas`, headers: auth(agente), payload: { ponto_coleta_id: PONTO, itens: itens.map((item_id) => ({ item_id, quantidade: 1 })) } });
  const retirar = (protocolo: string, codigo: string, itens?: string[]) =>
    app.inject({ method: 'POST', url: `/agente/pedidos/${protocolo}/retiradas`, headers: auth(agente), payload: { ponto_coleta_id: PONTO, codigo, ...(itens ? { itens } : {}) } });
  const errado = (codigo: string) => String((Number(codigo) + 1) % 10000).padStart(4, '0');

  beforeAll(async () => {
    app = await criarApp();
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    agente = await entrar(app, TELEFONES.agente);
    ana = await entrar(app, TELEFONES.ana);
    claudia = await entrar(app, TELEFONES.claudia);
  });
  afterAll(async () => {
    await pool.end();
    await app.close();
  });

  it('quem pediu recebe o código no recibo e em "Meus pedidos"; ninguém mais vê', async () => {
    const p = await publicar();
    expect(p.codigo_retirada).toMatch(/^\d{4}$/);
    expect(p.mensagem).toContain(p.codigo_retirada.split('').join(' '));
    const meus = (await app.inject({ method: 'GET', url: '/solicitacoes/minhas', headers: auth(ana) })).json() as { id: string; codigo_retirada: string }[];
    expect(meus.find((x) => x.id === p.id)!.codigo_retirada).toBe(p.codigo_retirada);

    await app.inject({ method: 'POST', url: `/mural/${p.id}/ofertas`, headers: auth(claudia), payload: {} });
    const vistos = [
      await app.inject({ method: 'GET', url: '/mural?abrangencia=brasil', headers: auth(claudia) }),
      await app.inject({ method: 'GET', url: '/voluntario/ofertas', headers: auth(claudia) }),
      await app.inject({ method: 'GET', url: `/agente/pedidos/${p.protocolo}`, headers: auth(agente) }),
    ];
    for (const r of vistos) expect(r.body).not.toContain('codigo_retirada');
  });

  it('o agente registra a retirada com o código; com tudo retirado, o pedido conclui e quem ajudou é avisado', async () => {
    const p = await publicar();
    await app.inject({ method: 'POST', url: `/mural/${p.id}/ofertas`, headers: auth(claudia), payload: {} });
    const { itens } = await ver(p.protocolo);
    expect((await ver(p.protocolo)).pode_retirar).toBe(false); // nada chegou ainda
    await entregar(p.protocolo, itens.map((i) => i.id));
    expect((await ver(p.protocolo)).pode_retirar).toBe(true);

    // A mensagem de chegada para quem pediu traz o código
    const avisos = (await app.inject({ method: 'GET', url: '/notificacoes', headers: auth(ana) })).json() as { texto: string }[];
    expect(avisos.some((n) => n.texto.includes(p.protocolo) && n.texto.includes(p.codigo_retirada))).toBe(true);

    // Código errado: recusa, e nada muda
    expect((await retirar(p.protocolo, errado(p.codigo_retirada))).statusCode).toBe(400);
    expect((await ver(p.protocolo)).itens.every((i) => i.status === 'entregue')).toBe(true);

    // Retirada parcial
    const r1 = await retirar(p.protocolo, p.codigo_retirada, [itens[0].id]);
    expect(r1.statusCode).toBe(201);
    expect(r1.json().concluido).toBe(false);
    // O resto
    const r2 = await retirar(p.protocolo, p.codigo_retirada);
    expect(r2.json().concluido).toBe(true);
    const depois = r2.json().pedido as PedidoAgente;
    expect(depois.status).toBe('concluida');
    expect(depois.retiradas).toHaveLength(2);
    expect(depois.retiradas.every((x) => x.origem === 'painel')).toBe(true);

    const ajuda = ((await app.inject({ method: 'GET', url: '/voluntario/ofertas', headers: auth(claudia) })).json() as { solicitacao_id: string; desfecho_texto: string }[])
      .find((o) => o.solicitacao_id === p.id)!;
    expect(ajuda.desfecho_texto).toContain('Sua ajuda chegou');
  });

  it('não dá para retirar o que ainda não chegou ao ponto', async () => {
    const p = await publicar();
    const { itens } = await ver(p.protocolo);
    await entregar(p.protocolo, [itens[0].id]);
    expect((await retirar(p.protocolo, p.codigo_retirada, [itens[1].id])).statusCode).toBe(400);
  });

  it('depois de 5 códigos errados, bloqueia por 1 hora (mesmo com o código certo)', async () => {
    const p = await publicar();
    const { itens } = await ver(p.protocolo);
    await entregar(p.protocolo, itens.map((i) => i.id));
    for (let i = 0; i < 5; i++) expect((await retirar(p.protocolo, errado(p.codigo_retirada))).statusCode).toBe(400);
    expect((await retirar(p.protocolo, p.codigo_retirada)).statusCode).toBe(429);
  });

  it('no sensor do ponto: protocolo + código no teclado registram a retirada', async () => {
    const p = await publicar();
    const { itens } = await ver(p.protocolo);
    await entregar(p.protocolo, itens.map((i) => i.id));
    const evento = (codigo: string) =>
      app.inject({ method: 'POST', url: `/iot/pontos/${PONTO}/eventos`, headers: { 'x-device-key': CHAVE }, payload: { tipo: 'retirada', protocolo: p.protocolo, codigo, delta_peso_kg: -8, peso_kg: 30 } });
    const ruim = await evento(errado(p.codigo_retirada));
    expect(ruim.statusCode).toBe(422);
    expect(ruim.json().lcd).toEqual(['Codigo errado', 'Tente de novo']);
    const ok = await evento(p.codigo_retirada);
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual(expect.objectContaining({ concluido: true, lcd: ['Retirada OK!', `Protocolo ${p.protocolo}`] }));
    expect((await ver(p.protocolo)).retiradas[0].origem).toBe('sensor');
  });

  it('doação parada no ponto: lembra quem pediu (com o código) e avisa a equipe do CRAS, uma vez', async () => {
    const p = await publicar();
    const { itens } = await ver(p.protocolo);
    await entregar(p.protocolo, [itens[0].id]);
    await pool.query("UPDATE item_solicitacao SET entregue_em = now() - interval '8 days' WHERE id = $1", [itens[0].id]);
    const sla = app.get(SlaService);
    expect(await sla.lembrarRetirada(7)).toBeGreaterThanOrEqual(1);
    expect(await sla.lembrarRetirada(7)).toBe(0); // não repete

    const avisosAna = (await app.inject({ method: 'GET', url: '/notificacoes', headers: auth(ana) })).json() as { tipo: string; texto: string }[];
    expect(avisosAna.some((n) => n.tipo === 'lembrete_retirada' && n.texto.includes(p.codigo_retirada))).toBe(true);
    const tecnico = await entrar(app, TELEFONES.fernanda);
    const avisosCras = (await app.inject({ method: 'GET', url: '/notificacoes', headers: auth(tecnico) })).json() as { tipo: string; texto: string }[];
    const doCras = avisosCras.find((n) => n.tipo === 'retirada_parada' && n.texto.includes(p.protocolo))!;
    expect(doCras).toBeDefined();
    expect(doCras.texto).not.toContain(p.codigo_retirada); // o código é só de quem pediu
  });

  it('registro (log): entrega, retirada e código errado ficam salvos, com quem registrou e onde', async () => {
    const p = await publicar();
    const { itens } = await ver(p.protocolo);
    expect((await entregar(p.protocolo, [itens[0].id, itens[1].id])).statusCode).toBe(201);
    expect((await retirar(p.protocolo, errado(p.codigo_retirada))).statusCode).toBe(400);
    expect((await retirar(p.protocolo, p.codigo_retirada, [itens[0].id])).statusCode).toBe(201);

    type Linha = { tipo: string; protocolo: string; ponto_coleta: string | null; origem: string; registrado_por: string | null; itens: { descricao: string }[] };
    const log = (await app.inject({ method: 'GET', url: `/agente/registro?protocolo=${p.protocolo}`, headers: auth(agente) })).json() as Linha[];
    expect(log.map((l) => l.tipo)).toEqual(['retirada', 'codigo_errado', 'entrega']); // mais recente primeiro
    const [ret, , ent] = log;
    expect(ent).toMatchObject({ origem: 'painel', registrado_por: 'Joana Pereira' });
    expect(ent.ponto_coleta).toBeTruthy();
    expect(ent.itens.map((i) => i.descricao)).toEqual([itens[0].descricao, itens[1].descricao]);
    expect(ret.itens.map((i) => i.descricao)).toEqual([itens[0].descricao]);
    expect(log.every((l) => !Object.keys(l).some((k) => k.includes('codigo')))).toBe(true); // o código nunca aparece no registro

    const soRetiradas = (await app.inject({ method: 'GET', url: `/agente/registro?tipo=retirada&protocolo=${p.protocolo}`, headers: auth(agente) })).json() as Linha[];
    expect(soRetiradas).toHaveLength(1);
    // Quem pede ou ajuda no app não vê o registro
    expect((await app.inject({ method: 'GET', url: '/agente/registro', headers: auth(ana) })).statusCode).toBe(403);
  });
});
