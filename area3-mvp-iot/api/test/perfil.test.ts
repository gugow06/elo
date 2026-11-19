import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { definirChavesGoogle } from '../src/auth/google';
import { auth, criarApp, entrar, TELEFONES } from './helpers';

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

describe('foto de perfil (pública) e quem está ajudando no pedido', () => {
  let app: NestFastifyApplication;
  let claudia: string;
  let roberto: string;
  // JPEG mínimo (cabeçalho FF D8 FF + fim FF D9): basta para conferir o tipo pelos bytes
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);

  beforeAll(async () => {
    app = await criarApp();
    claudia = await entrar(app, TELEFONES.claudia);
    roberto = await entrar(app, '+5511990000005');
  });
  afterAll(() => app.close());

  it('envia a foto, devolve o endereço e qualquer pessoa consegue ver', async () => {
    const r = await app.inject({ method: 'PUT', url: '/perfil/foto', headers: auth(claudia), payload: { imagem: JPEG.toString('base64') } });
    expect(r.statusCode).toBe(200);
    const foto = r.json().foto as string;
    expect(foto).toMatch(/^\/fotos\/[0-9a-f-]{36}$/);
    const img = await app.inject({ method: 'GET', url: foto });
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toBe('image/jpeg');
    expect(img.rawPayload.equals(JPEG)).toBe(true);
  });

  it('trocar a foto muda o endereço (o antigo deixa de existir)', async () => {
    const antes = (await app.inject({ method: 'GET', url: '/perfil', headers: auth(claudia) })).json().foto;
    const depois = (await app.inject({ method: 'PUT', url: '/perfil/foto', headers: auth(claudia), payload: { imagem: `data:image/jpeg;base64,${JPEG.toString('base64')}` } })).json().foto;
    expect(depois).not.toBe(antes);
    expect((await app.inject({ method: 'GET', url: antes })).statusCode).toBe(404);
  });

  it('recusa arquivo que não é imagem e precisa estar logado', async () => {
    const r = await app.inject({ method: 'PUT', url: '/perfil/foto', headers: auth(claudia), payload: { imagem: Buffer.from('<svg onload=alert(1)>').toString('base64') } });
    expect(r.statusCode).toBe(400);
    expect((await app.inject({ method: 'PUT', url: '/perfil/foto', payload: { imagem: JPEG.toString('base64') } })).statusCode).toBe(401);
  });

  it('o pedido mostra o primeiro nome e a foto de quem está ajudando', async () => {
    const mural = (await app.inject({ method: 'GET', url: '/mural', headers: auth(roberto) })).json() as { id: string; itens: { id: string }[] }[];
    const pedido = mural.find((p) => p.itens.length > 1)!;
    // Um item só: o pedido continua no mural para os outros verem quem já está ajudando
    const r = await app.inject({ method: 'POST', url: `/mural/${pedido.id}/ofertas`, headers: auth(claudia), payload: { itens: [pedido.itens[0].id] } });
    expect(r.statusCode).toBe(201);
    const visto = ((await app.inject({ method: 'GET', url: '/mural', headers: auth(roberto) })).json() as { id: string; pessoas_ajudando: number; ajudantes: { nome: string; foto: string | null }[] }[])
      .find((p) => p.id === pedido.id)!;
    expect(visto.pessoas_ajudando).toBe(1);
    expect(visto.ajudantes).toEqual([{ nome: 'Cláudia', foto: expect.stringMatching(/^\/fotos\//) }]);
  });

  it('remover a foto volta para as iniciais', async () => {
    const r = await app.inject({ method: 'DELETE', url: '/perfil/foto', headers: auth(claudia) });
    expect(r.statusCode).toBe(200);
    expect(r.json().foto).toBeNull();
  });
});
