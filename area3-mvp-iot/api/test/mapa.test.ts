import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth, criarApp, entrar, TELEFONES } from './helpers';

describe('mapa: pedidos só agregados por bairro, nunca no endereço', () => {
  let app: NestFastifyApplication;
  let pool: Pool;
  let ana: string;

  beforeAll(async () => {
    app = await criarApp();
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    ana = await entrar(app, TELEFONES.ana);
    // Dá posição ao bairro Vila Nova (o seed é fictício e não tem coordenadas)
    await pool.query("UPDATE bairro SET latitude = -12.9711, longitude = -38.5108 WHERE slug = 'vila-nova'");
  });
  afterAll(async () => {
    await pool.end();
    await app.close();
  });

  it('agrupa os pedidos do mural no centro do bairro', async () => {
    const r = await app.inject({ method: 'GET', url: '/mapa/pedidos?bbox=-38.6,-13.05,-38.4,-12.9', headers: auth(ana) });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual([
      { bairro_id: expect.any(String), bairro: 'Vila Nova', municipio_id: expect.any(String), municipio: 'São Bento do Vale', uf: 'SP', latitude: -12.9711, longitude: -38.5108, aproximado: false, pedidos: 1 },
    ]);
  });

  it('não devolve nada de cada pedido (id, título, protocolo, relato, pessoa)', async () => {
    const r = await app.inject({ method: 'GET', url: '/mapa/pedidos?bbox=-38.6,-13.05,-38.4,-12.9', headers: auth(ana) });
    const chaves = Object.keys(r.json()[0]);
    for (const proibida of ['id', 'titulo', 'protocolo', 'relato', 'cidadao_id', 'endereco', 'nome', 'faixa']) expect(chaves).not.toContain(proibida);
  });

  it('fora da área não vem nada; área inválida é recusada', async () => {
    const longe = await app.inject({ method: 'GET', url: '/mapa/pedidos?bbox=-47,-24,-46,-23', headers: auth(ana) });
    expect(longe.json()).toEqual([]);
    const ruim = await app.inject({ method: 'GET', url: '/mapa/pedidos?bbox=a,b,c,d', headers: auth(ana) });
    expect(ruim.statusCode).toBe(400);
  });

  it('o perfil diz onde o mapa abre sem a localização do aparelho', async () => {
    const r = await app.inject({ method: 'GET', url: '/perfil', headers: auth(ana) });
    // Ana mora no Jardim São Pedro, sem posição, num município fictício: o app usa o centro do Brasil
    expect(r.json()).toEqual(expect.objectContaining({ latitude: null, longitude: null, municipio: 'São Bento do Vale', uf: 'SP' }));
  });
});
