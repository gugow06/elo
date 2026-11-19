import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { definirBuscador } from '../src/geo/geocodificador';
import { auth, criarApp, entrar, TELEFONES } from './helpers';

// Centro de Campinas (IBGE) e um ponto no Cambuí
const CAMBUI = { lat: -22.8935, lon: -47.0526 };

/** Nominatim reverso responde o endereço; o resto (busca do bairro) sem resultado. */
function reverso(address: Record<string, string> | null) {
  definirBuscador(async (url) => {
    if (url.includes('/reverse')) return address ? new Response(JSON.stringify({ address }), { status: 200 }) : new Response('erro', { status: 500 });
    if (url.includes('nominatim')) return new Response('[]', { status: 200 });
    return new Response(JSON.stringify({ features: [] }), { status: 200 });
  });
}

describe('localização do aparelho (com a permissão da pessoa)', () => {
  let app: NestFastifyApplication;
  let pool: Pool;

  beforeAll(async () => {
    app = await criarApp();
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  });
  afterAll(async () => {
    definirBuscador(null);
    await pool.end();
    await app.close();
  });

  const ondeEstou = (lat: number, lon: number) => app.inject({ method: 'GET', url: `/geo/onde-estou?lat=${lat}&lon=${lon}` });

  it('posição → cidade do IBGE e bairro, para criar a conta (sem login)', async () => {
    reverso({ suburb: 'Cambuí', city: 'Campinas', state: 'São Paulo', 'ISO3166-2-lvl4': 'BR-SP' });
    const r = await ondeEstou(CAMBUI.lat, CAMBUI.lon);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ municipio: expect.objectContaining({ nome: 'Campinas', uf: 'SP', id: expect.any(String) }), bairro: { id: null, nome: 'Cambuí' } });
  });

  it('cidade com apóstrofo e acento também bate com o IBGE', async () => {
    reverso({ city: "Santa Bárbara d'Oeste", state: 'São Paulo', 'ISO3166-2-lvl4': 'BR-SP' });
    const r = await ondeEstou(-22.75, -47.41);
    expect(r.json().municipio).toEqual(expect.objectContaining({ nome: "Santa Bárbara d'Oeste", uf: 'SP' }));
  });

  it('sem serviço de endereço: fica com a cidade de centro mais perto', async () => {
    reverso(null);
    definirBuscador(async () => new Response('erro', { status: 500 }));
    const r = await ondeEstou(-22.906, -47.061);
    expect(r.json().municipio).toEqual(expect.objectContaining({ nome: 'Campinas', uf: 'SP' }));
    expect(r.json().bairro).toBeNull();
  });

  it('fora do Brasil: recusa', async () => {
    expect((await ondeEstou(40.7, -74.0)).statusCode).toBe(400);
  });

  it('criar conta com a localização: o bairro novo ganha posição aproximada (~1 km), não a da casa', async () => {
    reverso({});
    const campinas = (await pool.query("SELECT id FROM municipio WHERE codigo_ibge = '3509502'")).rows[0].id;
    const r = await app.inject({
      method: 'POST', url: '/auth/cadastro',
      payload: { nome: 'Pessoa GPS', email: 'pessoa.gps@example.com', telefone: '+5519990003333', municipio_id: campinas, bairro_nome: 'Jardim Boa Esperança', posicao: { latitude: -22.87654, longitude: -47.12345 } },
    });
    expect(r.statusCode).toBe(201);
    const b = (await pool.query("SELECT latitude::float AS latitude, longitude::float AS longitude, posicao_origem FROM bairro WHERE municipio_id = $1 AND slug = 'jardim-boa-esperanca'", [campinas])).rows[0];
    expect(b).toEqual({ latitude: -22.88, longitude: -47.12, posicao_origem: 'dispositivo' });
    // A conta não guarda a posição
    const colunas = (await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'usuario'")).rows.map((x) => x.column_name);
    expect(colunas.some((c: string) => /lat|lon|posic/.test(c))).toBe(false);
  });

  it('posição longe da cidade escolhida é ignorada', async () => {
    reverso({});
    const campinas = (await pool.query("SELECT id FROM municipio WHERE codigo_ibge = '3509502'")).rows[0].id;
    await app.inject({
      method: 'POST', url: '/auth/cadastro',
      payload: { nome: 'Pessoa Longe', email: 'pessoa.longe@example.com', telefone: '+5519990004444', municipio_id: campinas, bairro_nome: 'Vila Distante', posicao: { latitude: -3.1, longitude: -60.0 } },
    });
    const b = (await pool.query("SELECT latitude FROM bairro WHERE municipio_id = $1 AND slug = 'vila-distante'", [campinas])).rows[0];
    expect(b.latitude).toBeNull();
  });

  it('"Mais perto de mim" usa a localização do aparelho, quando a pessoa compartilha', async () => {
    const ana = await entrar(app, TELEFONES.ana);
    const luiz = await entrar(app, '+5511990000008');
    // Um pedido em Campinas (bairro com posição) e os do seed em São Bento do Vale
    const p = (await app.inject({ method: 'POST', url: '/solicitacoes', headers: auth(luiz), payload: { relato: 'Preciso de arroz e feijão para a família esta semana.' } })).json();
    const campinas = (await pool.query("SELECT id FROM municipio WHERE codigo_ibge = '3509502'")).rows[0].id;
    const bairro = (await pool.query("INSERT INTO bairro (municipio_id, nome, slug, latitude, longitude) VALUES ($1, 'Cambuí', 'cambui-perto', $2, $3) RETURNING id", [campinas, CAMBUI.lat, CAMBUI.lon])).rows[0].id;
    await pool.query('UPDATE solicitacao SET municipio_id = $1, bairro_id = $2 WHERE id = $3', [campinas, bairro, p.id]);

    const perto = (await app.inject({ method: 'GET', url: `/mural?abrangencia=brasil&lat=${CAMBUI.lat}&lon=${CAMBUI.lon}`, headers: auth(ana) })).json() as { id: string }[];
    expect(perto[0].id).toBe(p.id);
    const semLocal = (await app.inject({ method: 'GET', url: '/mural?abrangencia=brasil', headers: auth(ana) })).json() as { id: string; municipio: string }[];
    expect(semLocal[0].municipio).toBe('São Bento do Vale'); // sem localização: a cidade da conta primeiro

    // Início: distância de cada pedido e só os que estão no raio
    const comDistancia = perto as unknown as { id: string; distancia_km: number }[];
    expect(comDistancia[0].distancia_km).toBeLessThan(1);
    const noRaio = (await app.inject({ method: 'GET', url: `/mural?abrangencia=brasil&lat=${CAMBUI.lat}&lon=${CAMBUI.lon}&raio_km=30`, headers: auth(ana) })).json() as { id: string; distancia_km: number }[];
    expect(noRaio.map((x) => x.id)).toContain(p.id);
    expect(noRaio.every((x) => x.distancia_km <= 30)).toBe(true);
    expect(semLocal.every((x) => (x as unknown as { distancia_km: null }).distancia_km === null)).toBe(true);
  });
});
