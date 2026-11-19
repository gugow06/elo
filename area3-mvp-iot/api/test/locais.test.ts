import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth, criarApp, entrar, TELEFONES } from './helpers';

// Área que cobre o centro de Salvador (BA)
const BBOX = '-38.60,-13.05,-38.40,-12.90';

describe('locais da rede: cadastro pelo gestor e leitura no mapa', () => {
  let app: NestFastifyApplication;
  let gestor: string;
  let tecnico: string;
  let outroMunicipio: string;
  let ana: string;
  let bairroId: string;
  let abrigoId: string;

  const criar = (token: string, corpo: object) => app.inject({ method: 'POST', url: '/gestao/locais', headers: auth(token), payload: corpo });

  beforeAll(async () => {
    app = await criarApp();
    gestor = await entrar(app, TELEFONES.gestor);
    tecnico = await entrar(app, TELEFONES.fernanda);
    outroMunicipio = await entrar(app, TELEFONES.tecnicoOutroMunicipio);
    ana = await entrar(app, TELEFONES.ana);
    const b = await app.inject({ method: 'GET', url: '/bairros', headers: auth(gestor) });
    bairroId = b.json()[0].id;
  });
  afterAll(async () => {
    await app.close();
  });

  it('os pontos de coleta existentes já aparecem como locais', async () => {
    const r = await app.inject({ method: 'GET', url: '/gestao/locais', headers: auth(gestor) });
    expect(r.statusCode).toBe(200);
    expect(r.json().filter((l: { tipo: string; tem_sensor: boolean }) => l.tipo === 'ponto_coleta' && l.tem_sensor)).toHaveLength(2);
  });

  it('gestor cadastra um abrigo com coordenadas e ele aparece no mapa', async () => {
    const r = await criar(gestor, {
      tipo: 'abrigo', nome: 'Abrigo Municipal Liberdade', endereco: 'Rua Lima e Silva, 100, Liberdade, Salvador - BA',
      latitude: -12.9711, longitude: -38.5108, vagas: 40, horario: '24 horas', categorias: [],
    });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toEqual(expect.objectContaining({ tipo: 'abrigo', vagas: 40, ativo: true }));
    abrigoId = r.json().id;
    const mapa = await app.inject({ method: 'GET', url: `/mapa/locais?bbox=${BBOX}`, headers: auth(ana) });
    expect(mapa.json()).toEqual([expect.objectContaining({ id: abrigoId, nome: 'Abrigo Municipal Liberdade', latitude: -12.9711 })]);
  });

  it('ponto de coleta novo exige bairro e devolve a chave do sensor uma única vez', async () => {
    const base = { tipo: 'ponto_coleta', nome: 'Ponto de Coleta Escola Nova', endereco: 'Av. Sete de Setembro, 500, Salvador - BA', latitude: -12.98, longitude: -38.52, categorias: ['alimento'] };
    expect((await criar(gestor, base)).statusCode).toBe(400);
    const r = await criar(gestor, { ...base, bairro_id: bairroId, capacidade_kg: 150 });
    expect(r.statusCode).toBe(201);
    const { chave_dispositivo, ponto_coleta_id, capacidade_kg } = r.json();
    expect(chave_dispositivo).toMatch(/^[\w-]{20,}$/);
    expect(capacidade_kg).toBe(150);
    // A chave funciona no endpoint do sensor
    const ev = await app.inject({
      method: 'POST', url: `/iot/pontos/${ponto_coleta_id}/eventos`, headers: { 'x-device-key': chave_dispositivo },
      payload: { tipo: 'leitura_sensor', peso_kg: 12, temperatura_c: 25 },
    });
    expect(ev.statusCode).toBeLessThan(300);
    // E não aparece de novo na listagem
    const lista = await app.inject({ method: 'GET', url: '/gestao/locais', headers: auth(gestor) });
    expect(JSON.stringify(lista.json())).not.toContain(chave_dispositivo);
  });

  it('recusa coordenadas fora do Brasil e área de mapa inválida', async () => {
    const r = await criar(gestor, { tipo: 'saude', nome: 'UBS Teste', endereco: 'Rua A, 1, Lisboa', latitude: 38.72, longitude: -9.14 });
    expect(r.statusCode).toBe(400);
    const m = await app.inject({ method: 'GET', url: '/mapa/locais?bbox=1,2,3', headers: auth(ana) });
    expect(m.statusCode).toBe(400);
  });

  it('técnico consulta mas não cadastra; outro município não vê nem edita', async () => {
    expect((await app.inject({ method: 'GET', url: '/gestao/locais', headers: auth(tecnico) })).statusCode).toBe(200);
    expect((await criar(tecnico, { tipo: 'saude', nome: 'UBS X', endereco: 'Rua B, 2', latitude: -12.9, longitude: -38.5 })).statusCode).toBe(403);
    const lista = await app.inject({ method: 'GET', url: '/gestao/locais', headers: auth(outroMunicipio) });
    expect(lista.json().some((l: { id: string }) => l.id === abrigoId)).toBe(false);
  });

  it('gestor edita e desativa; desativado sai do mapa', async () => {
    const r = await app.inject({ method: 'PATCH', url: `/gestao/locais/${abrigoId}`, headers: auth(gestor), payload: { vagas: 35, telefone: '(71) 3333-0000' } });
    expect(r.json()).toEqual(expect.objectContaining({ vagas: 35, telefone: '(71) 3333-0000' }));
    await app.inject({ method: 'PATCH', url: `/gestao/locais/${abrigoId}`, headers: auth(gestor), payload: { ativo: false } });
    const mapa = await app.inject({ method: 'GET', url: `/mapa/locais?bbox=${BBOX}&tipo=abrigo`, headers: auth(ana) });
    expect(mapa.json()).toEqual([]);
    const inexistente = await app.inject({ method: 'PATCH', url: '/gestao/locais/00000000-0000-4000-8000-0000000000ff', headers: auth(gestor), payload: { ativo: true } });
    expect(inexistente.statusCode).toBe(404);
  });
});
