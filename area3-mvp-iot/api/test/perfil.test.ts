import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { definirChavesGoogle } from '../src/auth/google';
import { auth, criarApp } from './helpers';

const CLIENTE_GOOGLE = 'cliente-teste.apps.googleusercontent.com';
const EMAIL_ANA = 'ana.ribeiro@example.com';

describe('perfil e verificação em duas etapas por e-mail', () => {
  let app: NestFastifyApplication;
  let token: string;
  let tokenGoogle: (sub: string, email: string) => Promise<string>;

  const codigoDoPerfil = async () => (await app.inject({ method: 'POST', url: '/perfil/2fa/codigo', headers: auth(token), payload: {} })).json();

  beforeAll(async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    definirChavesGoogle(createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: 'teste', alg: 'RS256' }] }));
    process.env.GOOGLE_CLIENT_IDS = CLIENTE_GOOGLE;
    tokenGoogle = (sub, email) =>
      new SignJWT({ email, email_verified: true })
        .setProtectedHeader({ alg: 'RS256', kid: 'teste' })
        .setIssuer('https://accounts.google.com')
        .setAudience(CLIENTE_GOOGLE)
        .setSubject(sub)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);

    app = await criarApp();
    const c = await app.inject({ method: 'POST', url: '/auth/codigo', payload: { email: EMAIL_ANA } });
    const e = await app.inject({ method: 'POST', url: '/auth/entrar', payload: { email: EMAIL_ANA, codigo: c.json().codigo_demo } });
    token = e.json().token;
  });
  afterAll(async () => {
    delete process.env.GOOGLE_CLIENT_IDS;
    definirChavesGoogle(null);
    await app.close();
  });

  it('entrar com o código do e-mail confirma o e-mail; ainda não é verificado', async () => {
    const r = await app.inject({ method: 'GET', url: '/perfil', headers: auth(token) });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual(expect.objectContaining({
      nome: 'Ana Paula Ribeiro', email: EMAIL_ANA, email_confirmado: true, dois_fatores: false, verificado: false, google: false,
    }));
  });

  it('ativar a verificação em duas etapas exige o código do e-mail e deixa o perfil verificado', async () => {
    const errado = await app.inject({ method: 'POST', url: '/perfil/2fa/ativar', headers: auth(token), payload: { codigo: '000000' } });
    expect(errado.statusCode).toBe(401);
    const { codigo_demo, email } = await codigoDoPerfil();
    expect(email).toBe('a***o@example.com');
    const r = await app.inject({ method: 'POST', url: '/perfil/2fa/ativar', headers: auth(token), payload: { codigo: codigo_demo } });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual(expect.objectContaining({ dois_fatores: true, verificado: true }));
  });

  it('com a verificação ativa, o Google pede também o código do e-mail', async () => {
    const id_token = await tokenGoogle('google-ana', EMAIL_ANA);
    const r = await app.inject({ method: 'POST', url: '/auth/social', payload: { provedor: 'google', id_token } });
    expect(r.statusCode).toBe(200);
    expect(r.json().token).toBeUndefined();
    expect(r.json()).toEqual(expect.objectContaining({ dois_fatores: true, email: 'a***o@example.com' }));
    const { desafio, codigo_demo } = r.json();

    // O desafio não vale como sessão
    const eu = await app.inject({ method: 'GET', url: '/auth/eu', headers: auth(desafio) });
    expect(eu.statusCode).toBe(401);

    const errado = await app.inject({ method: 'POST', url: '/auth/social/confirmar', payload: { desafio, codigo: '000000' } });
    expect(errado.statusCode).toBe(401);
    const ok = await app.inject({ method: 'POST', url: '/auth/social/confirmar', payload: { desafio, codigo: codigo_demo } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().usuario.nome).toBe('Ana Paula Ribeiro');
    const perfil = await app.inject({ method: 'GET', url: '/perfil', headers: auth(ok.json().token) });
    expect(perfil.json().google).toBe(true);
  });

  it('desativar também exige o código e tira o selo', async () => {
    const { codigo_demo } = await codigoDoPerfil();
    const r = await app.inject({ method: 'POST', url: '/perfil/2fa/desativar', headers: auth(token), payload: { codigo: codigo_demo } });
    expect(r.json()).toEqual(expect.objectContaining({ dois_fatores: false, verificado: false }));
    const id_token = await tokenGoogle('google-ana', EMAIL_ANA);
    const g = await app.inject({ method: 'POST', url: '/auth/social', payload: { provedor: 'google', id_token } });
    expect(g.json().token).toEqual(expect.any(String));
  });

  it('perfil exige sessão', async () => {
    const r = await app.inject({ method: 'GET', url: '/perfil' });
    expect(r.statusCode).toBe(401);
  });
});
