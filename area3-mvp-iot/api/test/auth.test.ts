import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it, onTestFinished } from 'vitest';
import { definirChavesGoogle } from '../src/auth/google';
import { Pool } from 'pg';
import { auth, criarApp } from './helpers';

const CLIENTE_GOOGLE = 'cliente-teste.apps.googleusercontent.com';

describe('autenticação: e-mail + código e Google', () => {
  let app: NestFastifyApplication;
  let bairroId: string;
  let tokenGoogle: (dados: { sub: string; email: string; name?: string; aud?: string }) => Promise<string>;

  beforeAll(async () => {
    // Chaves de teste no lugar das chaves públicas do Google
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'teste', alg: 'RS256' };
    definirChavesGoogle(createLocalJWKSet({ keys: [jwk] }));
    process.env.GOOGLE_CLIENT_IDS = CLIENTE_GOOGLE;
    tokenGoogle = ({ sub, email, name, aud }) =>
      new SignJWT({ email, email_verified: true, name })
        .setProtectedHeader({ alg: 'RS256', kid: 'teste' })
        .setIssuer('https://accounts.google.com')
        .setAudience(aud ?? CLIENTE_GOOGLE)
        .setSubject(sub)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);

    app = await criarApp();
    const r = await app.inject({ method: 'GET', url: '/auth/bairros' });
    bairroId = r.json().find((b: { nome: string }) => b.nome === 'Vila Nova').id;
  });
  afterAll(async () => {
    process.env.MODO_DEMO = 'true';
    delete process.env.GOOGLE_CLIENT_IDS;
    definirChavesGoogle(null);
    await app.close();
  });

  const codigoPorEmail = async (email: string) => {
    const r = await app.inject({ method: 'POST', url: '/auth/codigo', payload: { email } });
    return r.json().codigo_demo as string;
  };

  it('config pública diz se está em modo demonstração', async () => {
    const r = await app.inject({ method: 'GET', url: '/config' });
    expect(r.json()).toEqual({ modo_demo: true, google: true });
    process.env.MODO_DEMO = 'false';
    expect((await app.inject({ method: 'GET', url: '/config' })).json().modo_demo).toBe(false);
    process.env.MODO_DEMO = 'true';
  });

  it('fora do modo demonstração o código só vai por e-mail, nunca na resposta', async () => {
    process.env.MODO_DEMO = 'false';
    const r = await app.inject({ method: 'POST', url: '/auth/codigo', payload: { email: 'maria.lima@example.com' } });
    process.env.MODO_DEMO = 'true';
    expect(r.statusCode).toBe(200);
    expect(r.json().codigo_demo).toBeUndefined();
  });

  it('lista bairros sem precisar de sessão', async () => {
    const r = await app.inject({ method: 'GET', url: '/auth/bairros' });
    expect(r.statusCode).toBe(200);
    expect(r.json()[0]).toEqual(expect.objectContaining({ id: expect.any(String), nome: expect.any(String), municipio: expect.any(String) }));
  });

  it('entra com e-mail + código (maiúsculas e espaços não importam)', async () => {
    const codigo = await codigoPorEmail('  Ana.Ribeiro@Example.com ');
    expect(codigo).toMatch(/^\d{6}$/);
    const r = await app.inject({ method: 'POST', url: '/auth/entrar', payload: { email: 'ana.ribeiro@example.com', codigo } });
    expect(r.statusCode).toBe(200);
    expect(r.json().usuario.nome).toBe('Ana Paula Ribeiro');
  });

  it('e-mail desconhecido não revela que a conta não existe', async () => {
    const r = await app.inject({ method: 'POST', url: '/auth/codigo', payload: { email: 'ninguem@example.com' } });
    expect(r.statusCode).toBe(200);
    expect(r.json().codigo_demo).toBeUndefined();
  });

  it('limita códigos ativos por conta', async () => {
    let ultimo = 0;
    for (let i = 0; i < 6; i++) ultimo = (await app.inject({ method: 'POST', url: '/auth/codigo', payload: { email: 'jose.souza@example.com' } })).statusCode;
    expect(ultimo).toBe(429);
  });

  it('Google: conta nova pede cadastro; depois de criada, entra direto', async () => {
    const id_token = await tokenGoogle({ sub: 'google-123', email: 'Nova.Pessoa@gmail.com', name: 'Nova Pessoa' });
    const antes = await app.inject({ method: 'POST', url: '/auth/social', payload: { provedor: 'google', id_token } });
    expect(antes.json()).toEqual({ cadastro_necessario: true, nome: 'Nova Pessoa', email: 'nova.pessoa@gmail.com' });

    const cad = await app.inject({
      method: 'POST', url: '/auth/cadastro',
      payload: { aceite_termos: true, nome: 'Nova Pessoa', email: 'outro@example.com', telefone: '11990001111', bairro_id: bairroId, social: { provedor: 'google', id_token } },
    });
    expect(cad.statusCode).toBe(201);
    expect(cad.json().usuario).toEqual(expect.objectContaining({ nome: 'Nova Pessoa', perfil: 'cidadao' }));

    const depois = await app.inject({ method: 'POST', url: '/auth/social', payload: { provedor: 'google', id_token } });
    expect(depois.json().usuario.nome).toBe('Nova Pessoa');
    // vale o e-mail confirmado pelo Google, não o digitado
    expect(await codigoPorEmail('nova.pessoa@gmail.com')).toMatch(/^\d{6}$/);
  });

  it('Google com o e-mail de uma conta existente vincula e entra', async () => {
    const id_token = await tokenGoogle({ sub: 'google-roberto', email: 'roberto.alves@example.com' });
    const r = await app.inject({ method: 'POST', url: '/auth/social', payload: { provedor: 'google', id_token } });
    expect(r.statusCode).toBe(200);
    expect(r.json().usuario.nome).toBe('Roberto Alves');
  });

  it('Google recusa token de outro aplicativo', async () => {
    const id_token = await tokenGoogle({ sub: 'google-x', email: 'x@gmail.com', aud: 'outro-app' });
    const r = await app.inject({ method: 'POST', url: '/auth/social', payload: { provedor: 'google', id_token } });
    expect(r.statusCode).toBe(401);
  });

  it('Google sem GOOGLE_CLIENT_IDS responde que não está configurado', async () => {
    delete process.env.GOOGLE_CLIENT_IDS;
    const id_token = await tokenGoogle({ sub: 'google-y', email: 'y@gmail.com' });
    const r = await app.inject({ method: 'POST', url: '/auth/social', payload: { provedor: 'google', id_token } });
    process.env.GOOGLE_CLIENT_IDS = CLIENTE_GOOGLE;
    expect(r.statusCode).toBe(501);
  });


  it('cadastro sem conta social confirma o e-mail por código', async () => {
    const cad = await app.inject({
      method: 'POST', url: '/auth/cadastro',
      payload: { aceite_termos: true, nome: 'Pessoa Email', email: 'pessoa.email@example.com', telefone: '+5511990002222', bairro_id: bairroId, },
    });
    expect(cad.statusCode).toBe(201);
    expect(cad.json().token).toBeUndefined();
    expect(cad.json().confirmar_email).toBe(true);

    const e = await app.inject({ method: 'POST', url: '/auth/entrar', payload: { email: 'pessoa.email@example.com', codigo: cad.json().codigo_demo } });
    expect(e.statusCode).toBe(200);
    expect(e.json().usuario.perfil).toBe('cidadao');
  });

  it('cadastro em qualquer cidade do Brasil, com bairro digitado (cria uma vez e reaproveita)', async () => {
    const loc = await app.inject({ method: 'GET', url: '/localidades?q=feira%20de%20santana' });
    const feira = loc.json().find((l: { tipo: string }) => l.tipo === 'municipio');
    expect(feira).toEqual(expect.objectContaining({ nome: 'Feira de Santana', uf: 'BA' }));
    const base = { telefone: '+5575990001111', municipio_id: feira.id, bairro_nome: '  Centro  ' };
    const r1 = await app.inject({ method: 'POST', url: '/auth/cadastro', payload: { aceite_termos: true, ...base, nome: 'Pessoa Feira', email: 'pessoa.feira@example.com' } });
    expect(r1.statusCode).toBe(201);
    const r2 = await app.inject({ method: 'POST', url: '/auth/cadastro', payload: { aceite_termos: true, ...base, nome: 'Outra Feira', email: 'outra.feira@example.com', telefone: '+5575990002222', bairro_nome: 'centro' } });
    expect(r2.statusCode).toBe(201);
    const bairros = await app.inject({ method: 'GET', url: `/auth/bairros?municipio=${feira.id}` });
    expect(bairros.json()).toEqual([expect.objectContaining({ nome: 'Centro', municipio: 'Feira de Santana', uf: 'BA' })]);
  });

  it('cadastro exige a cidade', async () => {
    const r = await app.inject({ method: 'POST', url: '/auth/cadastro', payload: { aceite_termos: true, nome: 'Sem Cidade', email: 'sem.bairro@example.com', telefone: '+5511990005555' } });
    expect(r.statusCode).toBe(400);
  });

  it('conta sem bairro: só a cidade; o bairro é escolhido no pedido (pelo nome que a localização encontrou)', async () => {
    const loc = await app.inject({ method: 'GET', url: '/localidades?q=feira%20de%20santana' });
    const feira = loc.json().find((l: { tipo: string }) => l.tipo === 'municipio');
    const cad = await app.inject({
      method: 'POST', url: '/auth/cadastro',
      payload: { aceite_termos: true, nome: 'Sem Bairro', email: 'so.cidade@example.com', telefone: '+5575990003333', municipio_id: feira.id },
    });
    expect(cad.statusCode).toBe(201);
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    onTestFinished(() => pool.end());
    const { rows } = await pool.query('SELECT bairro_id FROM usuario WHERE email = $1', ['so.cidade@example.com']);
    expect(rows[0].bairro_id).toBeNull();

    const cod = (await app.inject({ method: 'POST', url: '/auth/codigo', payload: { email: 'so.cidade@example.com' } })).json().codigo_demo;
    const token = (await app.inject({ method: 'POST', url: '/auth/entrar', payload: { email: 'so.cidade@example.com', codigo: cod } })).json().token;
    const relato = 'Preciso de roupas de frio para meus filhos pequenos';
    const semBairro = await app.inject({ method: 'POST', url: '/solicitacoes', headers: auth(token), payload: { relato } });
    expect(semBairro.statusCode).toBe(400);
    expect(semBairro.json().message).toMatch(/bairro/i);
    const comBairro = await app.inject({ method: 'POST', url: '/solicitacoes', headers: auth(token), payload: { relato, bairro_nome: 'Kalilândia' } });
    expect(comBairro.statusCode).toBe(201);
    const b = await pool.query('SELECT b.nome FROM solicitacao s JOIN bairro b ON b.id = s.bairro_id WHERE s.id = $1', [comBairro.json().id]);
    expect(b.rows[0].nome).toBe('Kalilândia');
  });

  it('não cria conta com e-mail ou telefone já cadastrados', async () => {
    const base = { nome: 'Outra Ana', bairro_id: bairroId };
    const porEmail = await app.inject({ method: 'POST', url: '/auth/cadastro', payload: { aceite_termos: true, ...base, email: 'ANA.RIBEIRO@example.com', telefone: '+5511990004444' } });
    expect(porEmail.statusCode).toBe(409);
    const porTel = await app.inject({ method: 'POST', url: '/auth/cadastro', payload: { aceite_termos: true, ...base, email: 'nova.ana@example.com', telefone: '+5511990000001' } });
    expect(porTel.statusCode).toBe(409);
  });

  it('não aceita outros provedores além do Google', async () => {
    for (const provedor of ['apple', 'facebook']) {
      const r = await app.inject({ method: 'POST', url: '/auth/social', payload: { provedor, sujeito: 'qualquer' } });
      expect(r.statusCode).toBe(400);
    }
  });

  it('cadastro ignora perfil enviado pelo app: toda conta é do app, nunca de equipe', async () => {
    const r = await app.inject({
      method: 'POST', url: '/auth/cadastro',
      payload: { aceite_termos: true, nome: 'Alguém', email: 'alguem@example.com', telefone: '+5511990003333', bairro_id: bairroId, perfil: 'gestor' },
    });
    expect(r.statusCode).toBe(201);
    const e = await app.inject({ method: 'POST', url: '/auth/entrar', payload: { email: 'alguem@example.com', codigo: r.json().codigo_demo } });
    expect(e.json().usuario.perfil).toBe('cidadao');
  });
});
