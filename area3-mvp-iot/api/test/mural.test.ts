import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth, criarApp, entrar, TELEFONES } from './helpers';

const LUIZ = '+5511990000008'; // cidadão do segundo município do seed

type Item = { id: string; categoria: string; criado_em: string; municipio: string; uf: string };

describe('mural com filtros por estado, cidade e categoria, e ajuda entre cidades', () => {
  let app: NestFastifyApplication;
  let ana: string;
  let pedidoOutraCidade: string;
  let outraCidadeId: string;

  const mural = async (token: string, qs = '') => {
    const r = await app.inject({ method: 'GET', url: `/mural${qs}`, headers: auth(token) });
    return { status: r.statusCode, itens: r.json() as Item[] };
  };

  beforeAll(async () => {
    app = await criarApp();
    ana = await entrar(app, TELEFONES.ana);
    const luiz = await entrar(app, LUIZ);
    const r = await app.inject({
      method: 'POST', url: '/solicitacoes', headers: auth(luiz),
      payload: { relato: 'Preciso de cobertores e agasalhos para meus filhos, está muito frio' },
    });
    pedidoOutraCidade = r.json().id;
    const loc = await app.inject({ method: 'GET', url: '/localidades?q=campo%20alegre%20do%20norte' });
    outraCidadeId = loc.json().find((l: { nome: string }) => l.nome === 'Campo Alegre do Norte').id;
  });
  afterAll(async () => {
    await app.close();
  });

  it('sem filtro mostra só o município de quem consulta', async () => {
    const { itens } = await mural(ana);
    expect(itens.length).toBeGreaterThan(0);
    expect(itens.every((i) => i.municipio === 'São Bento do Vale')).toBe(true);
    expect(itens.some((i) => i.id === pedidoOutraCidade)).toBe(false);
  });

  it('filtro por estado ou por cidade traz pedidos de outros municípios', async () => {
    const porUf = await mural(ana, '?uf=sp');
    expect(porUf.itens.some((i) => i.id === pedidoOutraCidade)).toBe(true);
    expect(porUf.itens.every((i) => i.uf === 'SP')).toBe(true);
    const porCidade = await mural(ana, `?municipio=${outraCidadeId}`);
    expect(porCidade.itens.map((i) => i.id)).toEqual([pedidoOutraCidade]);
    expect((await mural(ana, '?uf=BA')).itens).toEqual([]);
  });

  it('filtra por categoria e ordena por mais recentes ou por quem espera há mais tempo', async () => {
    const roupa = await mural(ana, '?uf=SP&categoria=roupa');
    expect(roupa.itens.length).toBeGreaterThan(0);
    expect(roupa.itens.every((i) => i.categoria === 'roupa')).toBe(true);

    const datas = (itens: Item[]) => itens.map((i) => new Date(i.criado_em).getTime());
    const recentes = datas((await mural(ana, '?uf=SP&ordem=recentes')).itens);
    expect(recentes).toEqual([...recentes].sort((a, b) => b - a));
    const aguardando = datas((await mural(ana, '?uf=SP&ordem=aguardando')).itens);
    expect(aguardando).toEqual([...aguardando].sort((a, b) => a - b));
  });

  it('pagina e recusa filtros inválidos', async () => {
    const p0 = await mural(ana, '?uf=SP&ordem=aguardando&limite=1&pagina=0');
    const p1 = await mural(ana, '?uf=SP&ordem=aguardando&limite=1&pagina=1');
    expect(p0.itens).toHaveLength(1);
    expect(p1.itens[0]?.id).not.toBe(p0.itens[0].id);
    expect((await mural(ana, '?uf=XYZ')).status).toBe(400);
    expect((await mural(ana, '?ordem=risco')).status).toBe(400);
  });

  it('nenhum filtro devolve dado pessoal nem faixa de risco', async () => {
    const { itens } = await mural(ana, '?uf=SP');
    const chaves = new Set(itens.flatMap((i) => Object.keys(i)));
    for (const proibida of ['faixa', 'cidadao_id', 'relato', 'endereco', 'nome', 'telefone']) expect(chaves.has(proibida)).toBe(false);
  });

  it('dá para assumir um pedido de outra cidade', async () => {
    const r = await app.inject({ method: 'POST', url: `/mural/${pedidoOutraCidade}/ofertas`, headers: auth(ana), payload: {} });
    expect(r.statusCode).toBe(201);
    expect(r.json().ponto_coleta.nome).toBe('Ponto de Coleta Centro');
  });
});
