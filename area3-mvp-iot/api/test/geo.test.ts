import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { definirBuscador } from '../src/geo/geocodificador';
import { auth, criarApp, entrar, TELEFONES } from './helpers';

const RESPOSTA_PHOTON = {
  features: [
    {
      geometry: { coordinates: [-38.5108, -12.9711] },
      properties: { name: 'CRAS Liberdade', street: 'Rua Lima e Silva', housenumber: '100', district: 'Liberdade', city: 'Salvador', state: 'Bahia', postcode: '40325-000' },
    },
    // Fora do Brasil ou sem estado: descartado
    { geometry: { coordinates: [-58.38, -34.6] }, properties: { name: 'Buenos Aires' } },
  ],
};

describe('base geográfica: UFs e municípios do IBGE e busca de endereço', () => {
  let app: NestFastifyApplication;
  let pool: Pool;
  let token: string;
  let chamadas = 0;

  beforeAll(async () => {
    app = await criarApp();
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    token = await entrar(app, TELEFONES.ana);
    // Nominatim sem resultado; o Photon acha o CRAS
    definirBuscador(async (url) => {
      if (url.includes('nominatim')) return new Response('[]', { status: 200 });
      chamadas++;
      return new Response(JSON.stringify(RESPOSTA_PHOTON), { status: 200 });
    });
  });
  afterAll(async () => {
    definirBuscador(null);
    await pool.end();
    await app.close();
  });

  it('importa as 27 UFs e os municípios do IBGE com coordenadas', async () => {
    const ufs = await pool.query('SELECT count(*)::int AS n FROM uf');
    expect(ufs.rows[0].n).toBe(27);
    const sp = await pool.query("SELECT nome, uf, capital, latitude::float AS lat FROM municipio WHERE codigo_ibge = 3550308");
    expect(sp.rows[0]).toEqual({ nome: 'São Paulo', uf: 'SP', capital: true, lat: expect.any(Number) });
    const n = await pool.query('SELECT count(*)::int AS n FROM municipio WHERE codigo_ibge IS NOT NULL');
    expect(n.rows[0].n).toBeGreaterThanOrEqual(5570);
  });

  it('busca cidades sem acento e põe a capital primeiro', async () => {
    const r = await app.inject({ method: 'GET', url: '/localidades?q=sao%20paulo' });
    expect(r.statusCode).toBe(200);
    const municipios = r.json().filter((l: { tipo: string }) => l.tipo === 'municipio');
    expect(municipios[0]).toEqual(expect.objectContaining({ nome: 'São Paulo', uf: 'SP', codigo_ibge: 3550308 }));
  });

  it('busca estado pela sigla ou pelo nome', async () => {
    const sigla = await app.inject({ method: 'GET', url: '/localidades?q=BA' });
    expect(sigla.json()[0]).toEqual(expect.objectContaining({ tipo: 'uf', uf: 'BA', nome: 'Bahia' }));
    const nome = await app.inject({ method: 'GET', url: '/localidades?q=goias' });
    expect(nome.json().some((l: { tipo: string; uf: string }) => l.tipo === 'uf' && l.uf === 'GO')).toBe(true);
  });

  it('localidades exige pelo menos 2 letras', async () => {
    const r = await app.inject({ method: 'GET', url: '/localidades?q=a' });
    expect(r.statusCode).toBe(400);
  });

  it('busca de endereço devolve só lugares no Brasil, com UF em sigla, e usa cache', async () => {
    const r = await app.inject({ method: 'GET', url: '/geo/buscar?q=CRAS%20Liberdade%20Salvador', headers: auth(token) });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual([
      expect.objectContaining({ nome: 'CRAS Liberdade', bairro: 'Liberdade', cidade: 'Salvador', uf: 'BA', latitude: -12.9711, longitude: -38.5108 }),
    ]);
    expect(r.json()[0].endereco).toContain('Rua Lima e Silva, 100');
    await app.inject({ method: 'GET', url: '/geo/buscar?q=cras%20liberdade%20salvador', headers: auth(token) });
    expect(chamadas).toBe(1);
  });

  it('busca de endereço exige sessão e responde 503 se o serviço cair', async () => {
    expect((await app.inject({ method: 'GET', url: '/geo/buscar?q=Recife' })).statusCode).toBe(401);
    definirBuscador(async () => new Response('erro', { status: 500 }));
    const r = await app.inject({ method: 'GET', url: '/geo/buscar?q=Recife', headers: auth(token) });
    expect(r.statusCode).toBe(503);
  });
});
