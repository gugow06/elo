import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { completarBairro, posicaoDoBairro } from '../src/geo/bairros';
import { definirBuscador } from '../src/geo/geocodificador';
import { auth, criarApp, entrar, TELEFONES } from './helpers';

const lugar = (name: string, city: string, lon: number, lat: number, extra: Record<string, string> = {}) => ({
  geometry: { coordinates: [lon, lat] },
  properties: { name, city, state: 'São Paulo', osm_key: 'place', osm_value: 'suburb', ...extra },
});

// Como o buscador responde de verdade: homônimos de cidades vizinhas e até rodovia "no bairro"
const HOMONIMOS = [
  lugar('Rodovia Professor Zeferino Vaz', 'Paulínia', -47.14, -22.765, { district: 'Boa Esperança' }),
  lugar('Jardim Boa Esperança', 'Hortolândia', -47.1968, -22.8517),
  lugar('Jardim Boa Esperança', 'Itupeva', -47.0343, -23.1623),
];
const CAMPINAS = { nome: 'Campinas', uf: 'SP', latitude: -22.9053, longitude: -47.0659 };

let resposta: unknown[] = [];
let ultimaUrl = '';
const usarResposta = (features: unknown[]) => {
  definirBuscador(async (url) => {
    ultimaUrl = url;
    return new Response(JSON.stringify({ features: resposta }), { status: 200 });
  });
  resposta = features;
};

describe('posição do bairro digitado no cadastro', () => {
  afterAll(() => definirBuscador(null));

  it('não aceita bairro homônimo de outra cidade nem rodovia: fica sem posição', async () => {
    usarResposta(HOMONIMOS);
    expect(await posicaoDoBairro('Jardim Boa Esperança', CAMPINAS)).toBeNull();
    expect(ultimaUrl).toContain('osm_tag=place');
    expect(ultimaUrl).toContain('lat=-22.9053');
  });

  it('aceita o bairro com o mesmo nome (sem acento ou maiúsculas) na mesma cidade e perto dela', async () => {
    usarResposta([...HOMONIMOS, lugar('Cambuí', 'Campinas', -47.0526, -22.8935)]);
    expect(await posicaoDoBairro('cambui', CAMPINAS)).toEqual({ latitude: -22.8935, longitude: -47.0526 });
  });

  it('recusa resultado com o nome da cidade mas longe dela (dado errado do mapa)', async () => {
    usarResposta([lugar('Cambuí', 'Campinas', -40.0, -10.0)]);
    expect(await posicaoDoBairro('Cambuí', CAMPINAS)).toBeNull();
  });
});

describe('mapa: pedido de bairro sem posição aparece como aproximado', () => {
  let app: NestFastifyApplication;
  let pool: Pool;
  let token: string;
  let bairroId: string;

  beforeAll(async () => {
    app = await criarApp();
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    token = await entrar(app, TELEFONES.ana);
    // Um pedido do mural num bairro digitado de Campinas (sem posição)
    const mun = (await pool.query("SELECT id FROM municipio WHERE codigo_ibge = '3509502'")).rows[0].id;
    bairroId = (await pool.query("INSERT INTO bairro (municipio_id, nome, slug) VALUES ($1, 'Cambuí', 'cambui') RETURNING id", [mun])).rows[0].id;
    await pool.query("UPDATE solicitacao SET municipio_id = $1, bairro_id = $2 WHERE status = 'no_mural' AND faixa = 'verde' AND id = (SELECT id FROM solicitacao WHERE status = 'no_mural' AND faixa = 'verde' LIMIT 1)", [mun, bairroId]);
  });
  afterAll(async () => {
    definirBuscador(null);
    await pool.end();
    await app.close();
  });

  const pedidosEmCampinas = async () =>
    (await app.inject({ method: 'GET', url: '/mapa/pedidos?bbox=-47.3,-23.1,-46.8,-22.7', headers: auth(token) })).json() as {
      bairro: string; aproximado: boolean; latitude: number;
    }[];

  it('sem posição: usa o centro da cidade e avisa que é aproximado', async () => {
    const [p] = await pedidosEmCampinas();
    expect(p).toEqual(expect.objectContaining({ bairro: 'Cambuí', aproximado: true, latitude: CAMPINAS.latitude }));
  });

  it('depois de achar a posição do bairro, o pedido vai para o bairro', async () => {
    usarResposta([lugar('Cambuí', 'Campinas', -47.0526, -22.8935)]);
    expect(await completarBairro(pool, bairroId)).toBe(true);
    const [p] = await pedidosEmCampinas();
    expect(p).toEqual(expect.objectContaining({ bairro: 'Cambuí', aproximado: false, latitude: -22.8935 }));
  });

  it('sem resultado confiável, marca que já procurou para não repetir a cada subida', async () => {
    const outro = (await pool.query("INSERT INTO bairro (municipio_id, nome, slug) SELECT municipio_id, 'Jardim Boa Esperança', 'jardim-boa-esperanca' FROM bairro WHERE id = $1 RETURNING id", [bairroId])).rows[0].id;
    usarResposta(HOMONIMOS);
    expect(await completarBairro(pool, outro)).toBe(false);
    const b = (await pool.query('SELECT latitude, posicao_buscada_em FROM bairro WHERE id = $1', [outro])).rows[0];
    expect(b.latitude).toBeNull();
    expect(b.posicao_buscada_em).not.toBeNull();
  });
});
