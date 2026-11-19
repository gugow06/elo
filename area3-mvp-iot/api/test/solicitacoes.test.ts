import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth, criarApp, entrar, TELEFONES } from './helpers';

describe.skipIf(!process.env.DATABASE_URL)('solicitações e triagem na API', () => {
  let app: NestFastifyApplication;
  let tokenAna: string;
  let tokenFernanda: string;

  beforeAll(async () => {
    app = await criarApp();
    tokenAna = await entrar(app, TELEFONES.ana);
    tokenFernanda = await entrar(app, TELEFONES.fernanda);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('login sem senha: código inválido é recusado', async () => {
    const r = await app.inject({ method: 'POST', url: '/auth/entrar', payload: { telefone: TELEFONES.ana, codigo: '000000' } });
    expect(r.statusCode).toBe(401);
  });

  it('pedido verde vai ao mural com ponto de coleta e protocolo de 6 dígitos', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/solicitacoes',
      headers: auth(tokenAna),
      payload: { relato: 'Perdi o emprego e preciso de uma cesta básica para meus dois filhos' },
    });
    expect(r.statusCode).toBe(201);
    const corpo = r.json();
    expect(corpo.protocolo).toMatch(/^\d{6}$/);
    expect(corpo.ponto_coleta).not.toBeNull();
    expect(corpo.status).toBe('Aguardando um voluntário do seu bairro');
  });

  it('RT-05: a resposta ao cidadão nunca revela a faixa de risco', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/solicitacoes',
      headers: auth(tokenAna),
      payload: { relato: 'Meu marido me bate quando bebe e eu tenho medo de ficar em casa' },
    });
    expect(r.statusCode).toBe(201);
    const texto = JSON.stringify(r.json()).toLowerCase();
    expect(texto).not.toMatch(/vermelh|faixa|risco|violen/);
    expect(r.json().status).toBe('A equipe do CRAS está cuidando do seu pedido');
  });

  it('pedido vermelho vai à fila do técnico em primeiro lugar e gera alerta', async () => {
    const fila = await app.inject({ method: 'GET', url: '/tecnico/fila', headers: auth(tokenFernanda) });
    expect(fila.statusCode).toBe(200);
    expect(fila.json()[0].faixa).toBe('vermelha');
    expect(fila.json()[0].classificacao_origem).toBe('regra');

    const notif = await app.inject({ method: 'GET', url: '/tecnico/notificacoes', headers: auth(tokenFernanda) });
    expect(notif.json().some((n: { tipo: string }) => n.tipo === 'alerta_vermelho')).toBe(true);
  });

  it('cidadão não acessa a fila do técnico', async () => {
    const r = await app.inject({ method: 'GET', url: '/tecnico/fila', headers: auth(tokenAna) });
    expect(r.statusCode).toBe(403);
  });

  it('técnico de outro município não vê a fila deste município', async () => {
    const outro = await entrar(app, TELEFONES.tecnicoOutroMunicipio);
    const r = await app.inject({ method: 'GET', url: '/tecnico/fila', headers: auth(outro) });
    expect(r.json()).toHaveLength(0);
  });

  it('ler o relato original gera evento de auditoria', async () => {
    const fila = await app.inject({ method: 'GET', url: '/tecnico/fila', headers: auth(tokenFernanda) });
    const id = fila.json()[0].id;
    const ficha = await app.inject({ method: 'GET', url: `/tecnico/solicitacoes/${id}`, headers: auth(tokenFernanda) });
    expect(ficha.json().relato).toContain('bate');

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM evento_auditoria WHERE acao = 'ler_relato' AND entidade_id = $1`,
      [id],
    );
    await pool.end();
    expect(rows[0].n).toBeGreaterThanOrEqual(1);
  });

  it('reclassificação exige justificativa e cria nova classificação (histórico imutável)', async () => {
    const fila = await app.inject({ method: 'GET', url: '/tecnico/fila', headers: auth(tokenFernanda) });
    const id = fila.json()[0].id;

    const sem = await app.inject({
      method: 'POST', url: `/tecnico/solicitacoes/${id}/reclassificar`, headers: auth(tokenFernanda),
      payload: { faixa: 'amarela', categoria: 'outro', justificativa: 'curta' },
    });
    expect(sem.statusCode).toBe(400);

    const ok = await app.inject({
      method: 'POST', url: `/tecnico/solicitacoes/${id}/reclassificar`, headers: auth(tokenFernanda),
      payload: { faixa: 'amarela', categoria: 'outro', justificativa: 'Caso acompanhado pelo CREAS, contato feito por telefone.' },
    });
    expect(ok.statusCode).toBe(201);
    const ficha = await app.inject({ method: 'GET', url: `/tecnico/solicitacoes/${id}`, headers: auth(tokenFernanda) });
    expect(ficha.json().classificacoes).toHaveLength(2);
  });

  it('consulta pública exige protocolo + data de nascimento', async () => {
    const minhas = await app.inject({ method: 'GET', url: '/solicitacoes/minhas', headers: auth(tokenAna) });
    const protocolo = minhas.json()[0].protocolo;
    const certa = await app.inject({ method: 'GET', url: `/solicitacoes/consulta/${protocolo}?nascimento=1997-03-14` });
    expect(certa.statusCode).toBe(200);
    const errada = await app.inject({ method: 'GET', url: `/solicitacoes/consulta/${protocolo}?nascimento=2000-01-01` });
    expect(errada.statusCode).toBe(404);
  });

  it('entrada inválida é rejeitada com 400', async () => {
    const r = await app.inject({ method: 'POST', url: '/solicitacoes', headers: auth(tokenAna), payload: { relato: 'oi' } });
    expect(r.statusCode).toBe(400);
  });
});
