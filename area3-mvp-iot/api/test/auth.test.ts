import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CONTAS_SOCIAIS_DEMO } from '../db/seed';
import { auth, criarApp } from './helpers';

describe('autenticação: conta ELO, cadastro e login social (simulado)', () => {
  let app: NestFastifyApplication;
  let bairroId: string;

  beforeAll(async () => {
    app = await criarApp();
    const r = await app.inject({ method: 'GET', url: '/auth/bairros' });
    bairroId = r.json().find((b: { nome: string }) => b.nome === 'Vila Nova').id;
  });
  afterAll(async () => {
    process.env.MODO_DEMO = 'true';
    await app.close();
  });

  it('lista bairros sem precisar de sessão', async () => {
    const r = await app.inject({ method: 'GET', url: '/auth/bairros' });
    expect(r.statusCode).toBe(200);
    expect(r.json()[0]).toEqual(expect.objectContaining({ id: expect.any(String), nome: expect.any(String), municipio: expect.any(String) }));
  });

  it('entra com Google numa conta já vinculada', async () => {
    const r = await app.inject({ method: 'POST', url: '/auth/social', payload: { provedor: 'google', sujeito: CONTAS_SOCIAIS_DEMO.ana } });
    expect(r.statusCode).toBe(200);
    expect(r.json().usuario).toEqual(expect.objectContaining({ nome: 'Ana Paula Ribeiro', perfil: 'cidadao' }));
    const eu = await app.inject({ method: 'GET', url: '/auth/eu', headers: auth(r.json().token) });
    expect(eu.statusCode).toBe(200);
  });

  it('a mesma identidade em outro provedor não entra', async () => {
    const r = await app.inject({ method: 'POST', url: '/auth/social', payload: { provedor: 'facebook', sujeito: CONTAS_SOCIAIS_DEMO.ana } });
    expect(r.json()).toEqual({ cadastro_necessario: true });
  });

  it('identidade nova pede cadastro e, depois de criado, entra direto', async () => {
    const id = { provedor: 'apple', sujeito: 'demo-apple-nova', email: 'nova.pessoa@example.com' };
    const antes = await app.inject({ method: 'POST', url: '/auth/social', payload: id });
    expect(antes.json()).toEqual({ cadastro_necessario: true });

    const cad = await app.inject({
      method: 'POST', url: '/auth/cadastro',
      payload: { nome: 'Nova Pessoa', telefone: '11990001111', bairro_id: bairroId, perfil: 'voluntario', social: id },
    });
    expect(cad.statusCode).toBe(201);
    expect(cad.json().usuario).toEqual(expect.objectContaining({ nome: 'Nova Pessoa', perfil: 'voluntario' }));

    const depois = await app.inject({ method: 'POST', url: '/auth/social', payload: id });
    expect(depois.json().usuario.nome).toBe('Nova Pessoa');
  });

  it('cadastro só com telefone confirma por código', async () => {
    const cad = await app.inject({
      method: 'POST', url: '/auth/cadastro',
      payload: { nome: 'Pessoa Telefone', telefone: '+5511990002222', bairro_id: bairroId, perfil: 'cidadao' },
    });
    expect(cad.statusCode).toBe(201);
    expect(cad.json().token).toBeUndefined();
    expect(cad.json().confirmar_telefone).toBe(true);

    const e = await app.inject({ method: 'POST', url: '/auth/entrar', payload: { telefone: '+5511990002222', codigo: cad.json().codigo_demo } });
    expect(e.statusCode).toBe(200);
    expect(e.json().usuario.perfil).toBe('cidadao');
  });

  it('não cria conta com telefone já cadastrado', async () => {
    const r = await app.inject({
      method: 'POST', url: '/auth/cadastro',
      payload: { nome: 'Outra Ana', telefone: '+5511990000001', bairro_id: bairroId, perfil: 'cidadao' },
    });
    expect(r.statusCode).toBe(409);
  });

  it('cadastro não aceita perfil de equipe', async () => {
    const r = await app.inject({
      method: 'POST', url: '/auth/cadastro',
      payload: { nome: 'Alguém', telefone: '+5511990003333', bairro_id: bairroId, perfil: 'gestor' },
    });
    expect(r.statusCode).toBe(400);
  });

  it('fora do modo demonstração o login social simulado é recusado', async () => {
    process.env.MODO_DEMO = 'false';
    const r = await app.inject({ method: 'POST', url: '/auth/social', payload: { provedor: 'google', sujeito: CONTAS_SOCIAIS_DEMO.ana } });
    process.env.MODO_DEMO = 'true';
    expect(r.statusCode).toBe(501);
  });
});
