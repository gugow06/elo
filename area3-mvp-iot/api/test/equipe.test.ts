import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth, criarApp, entrar, TELEFONES } from './helpers';

describe('equipe do painel: gestor convida técnicos', () => {
  let app: NestFastifyApplication;
  let gestor: string;
  let tecnico: string;

  beforeAll(async () => {
    app = await criarApp();
    gestor = await entrar(app, TELEFONES.gestor);
    tecnico = await entrar(app, TELEFONES.fernanda);
  });
  afterAll(async () => {
    await app.close();
  });

  it('gestor convida um técnico, que entra no painel por e-mail', async () => {
    const r = await app.inject({
      method: 'POST', url: '/gestao/equipe', headers: auth(gestor),
      payload: { nome: 'Carla Nova', email: 'Carla.Nova@example.com', telefone: '11990007777', perfil: 'tecnico' },
    });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toEqual(expect.objectContaining({ email: 'carla.nova@example.com', telefone: '+5511990007777', perfil: 'tecnico' }));
    const c = await app.inject({ method: 'POST', url: '/auth/codigo', payload: { email: 'carla.nova@example.com' } });
    const e = await app.inject({ method: 'POST', url: '/auth/entrar', payload: { email: 'carla.nova@example.com', codigo: c.json().codigo_demo } });
    expect(e.json().usuario.perfil).toBe('tecnico');
    const fila = await app.inject({ method: 'GET', url: '/tecnico/fila', headers: auth(e.json().token) });
    expect(fila.statusCode).toBe(200);
  });

  it('lista só a equipe do município, sem cidadãos', async () => {
    const r = await app.inject({ method: 'GET', url: '/gestao/equipe', headers: auth(gestor) });
    const perfis = new Set(r.json().map((u: { perfil: string }) => u.perfil));
    expect([...perfis].sort()).toEqual(['agente', 'gestor', 'tecnico']);
    expect(r.json().some((u: { nome: string }) => u.nome === 'Patrícia Gomes')).toBe(false); // outro município
  });

  it('só gestor convida; não convida cidadão nem e-mail repetido', async () => {
    const base = { nome: 'Fulano Teste', email: 'fulano@example.com', telefone: '+5511990008888' };
    expect((await app.inject({ method: 'POST', url: '/gestao/equipe', headers: auth(tecnico), payload: { ...base, perfil: 'tecnico' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/gestao/equipe', headers: auth(gestor), payload: { ...base, perfil: 'cidadao' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/gestao/equipe', headers: auth(gestor), payload: { ...base, email: 'fernanda.costa@example.com', perfil: 'tecnico' } })).statusCode).toBe(409);
  });
});
