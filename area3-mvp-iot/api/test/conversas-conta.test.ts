import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TERMOS_VERSAO } from '../src/perfil/termos';
import { auth, criarApp, entrar, TELEFONES } from './helpers';

type Item = { id: string; descricao: string };

describe.skipIf(!process.env.DATABASE_URL)('conversas entre cidadãos, termos e exclusão de conta', () => {
  let app: NestFastifyApplication;
  let pool: Pool;
  let ana: string;
  let claudia: string;
  let fernanda: string;
  let pedidoId: string;
  let itens: Item[];
  let conversaId: string;

  beforeAll(async () => {
    app = await criarApp();
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    ana = await entrar(app, TELEFONES.ana);
    claudia = await entrar(app, TELEFONES.claudia);
    fernanda = await entrar(app, '+5511990000003'); // José, morador que não ajuda neste pedido
    const r = await app.inject({
      method: 'POST', url: '/solicitacoes', headers: auth(ana),
      payload: { relato: 'Perdi o emprego e preciso de uma cesta básica para meus dois filhos' },
    });
    pedidoId = r.json().id;
    const mural = (await app.inject({ method: 'GET', url: '/mural?abrangencia=brasil&limite=50', headers: auth(claudia) })).json() as { id: string; itens: Item[] }[];
    itens = mural.find((p) => p.id === pedidoId)!.itens;
    expect(itens.length).toBeGreaterThan(2);
  });

  afterAll(async () => {
    await pool?.end();
    await app?.close();
  });

  it('a conversa abre quando alguém se oferece para ajudar, para os dois lados', async () => {
    const o = await app.inject({ method: 'POST', url: `/mural/${pedidoId}/ofertas`, headers: auth(claudia), payload: { itens: [itens[0].id] } });
    expect(o.statusCode).toBe(201);
    const daClaudia = (await app.inject({ method: 'GET', url: `/conversas?solicitacao_id=${pedidoId}`, headers: auth(claudia) })).json();
    expect(daClaudia).toHaveLength(1);
    expect(daClaudia[0]).toMatchObject({ meu_papel: 'ajuda', outra_pessoa: 'Ana' });
    conversaId = daClaudia[0].id;
    const daAna = (await app.inject({ method: 'GET', url: `/conversas?solicitacao_id=${pedidoId}`, headers: auth(ana) })).json();
    expect(daAna[0]).toMatchObject({ id: conversaId, meu_papel: 'pediu', outra_pessoa: 'Cláudia' });
    // Abrir de novo devolve a mesma conversa
    const aberta = await app.inject({ method: 'POST', url: '/conversas', headers: auth(claudia), payload: { solicitacao_id: pedidoId } });
    expect(aberta.json().id).toBe(conversaId);
  });

  it('mensagens: enviar, não lidas, ler e responder', async () => {
    const m = await app.inject({ method: 'POST', url: `/conversas/${conversaId}/mensagens`, headers: auth(claudia), payload: { texto: 'Oi! Levo o arroz amanhã de manhã.' } });
    expect(m.statusCode).toBe(201);
    expect(m.json()).toMatchObject({ minha: true, texto: 'Oi! Levo o arroz amanhã de manhã.' });

    expect((await app.inject({ method: 'GET', url: '/conversas/nao-lidas', headers: auth(ana) })).json().mensagens).toBe(1);
    const lista = (await app.inject({ method: 'GET', url: '/conversas', headers: auth(ana) })).json();
    expect(lista.find((c: { id: string }) => c.id === conversaId)).toMatchObject({ nao_lidas: 1, ultima_mensagem: 'Oi! Levo o arroz amanhã de manhã.', ultima_minha: false });

    const lidas = (await app.inject({ method: 'GET', url: `/conversas/${conversaId}/mensagens`, headers: auth(ana) })).json();
    expect(lidas).toEqual([expect.objectContaining({ minha: false, texto: 'Oi! Levo o arroz amanhã de manhã.' })]);
    expect((await app.inject({ method: 'GET', url: '/conversas/nao-lidas', headers: auth(ana) })).json().mensagens).toBe(0);

    await app.inject({ method: 'POST', url: `/conversas/${conversaId}/mensagens`, headers: auth(ana), payload: { texto: 'Obrigada, Cláudia!' } });
    const daClaudia = (await app.inject({ method: 'GET', url: `/conversas/${conversaId}/mensagens`, headers: auth(claudia) })).json();
    expect(daClaudia.map((x: { texto: string; minha: boolean; lida: boolean }) => [x.texto, x.minha, x.lida])).toEqual([
      ['Oi! Levo o arroz amanhã de manhã.', true, true],
      ['Obrigada, Cláudia!', false, true],
    ]);
  });

  it('ninguém de fora lê, escreve ou abre conversa sem ajudar', async () => {
    expect((await app.inject({ method: 'GET', url: `/conversas/${conversaId}/mensagens`, headers: auth(fernanda) })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/conversas/${conversaId}/mensagens`, headers: auth(fernanda), payload: { texto: 'oi' } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/conversas', headers: auth(fernanda), payload: { solicitacao_id: pedidoId } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/conversas/${conversaId}/mensagens`, headers: auth(ana), payload: { texto: 'x'.repeat(1001) } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: `/conversas/${conversaId}/mensagens`, headers: auth(ana), payload: { texto: '   ' } })).statusCode).toBe(400);
  });

  it('a versão dos termos é a mesma no app e na API', () => {
    const app = readFileSync(join(__dirname, '../../app/lib/textos_legais.dart'), 'utf8');
    expect(app).toContain(`const termosVersao = '${TERMOS_VERSAO}';`);
  });

  it('termos: o perfil mostra a versão e aceita só a versão atual', async () => {
    const p = (await app.inject({ method: 'GET', url: '/perfil', headers: auth(fernanda) })).json();
    expect(p.termos.versao_atual).toBe(TERMOS_VERSAO);
    expect((await app.inject({ method: 'POST', url: '/perfil/termos', headers: auth(fernanda), payload: { versao: '2000-01-01' } })).statusCode).toBe(400);
    const ok = await app.inject({ method: 'POST', url: '/perfil/termos', headers: auth(fernanda), payload: { versao: TERMOS_VERSAO } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().termos).toMatchObject({ versao_aceita: TERMOS_VERSAO, aceitos_em: expect.any(String) });
  });

  it('criar conta exige aceitar os termos e guarda a versão aceita', async () => {
    const bairro = (await app.inject({ method: 'GET', url: '/auth/bairros' })).json()[0].id;
    const base = { nome: 'Bruno Teste', email: 'bruno.exclusao@example.com', telefone: '+5511990007777', bairro_id: bairro };
    expect((await app.inject({ method: 'POST', url: '/auth/cadastro', payload: base })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/auth/cadastro', payload: { ...base, aceite_termos: false } })).statusCode).toBe(400);
    const cad = await app.inject({ method: 'POST', url: '/auth/cadastro', payload: { ...base, aceite_termos: true } });
    expect(cad.statusCode).toBe(201);
    const { rows } = await pool.query('SELECT termos_versao, termos_aceitos_em FROM usuario WHERE email = $1', ['bruno.exclusao@example.com']);
    expect(rows[0].termos_versao).toBe(TERMOS_VERSAO);
    expect(rows[0].termos_aceitos_em).not.toBeNull();
  });

  it('excluir a conta: confirma pelo código, cancela a ajuda, apaga os dados e encerra a sessão', async () => {
    const email = 'bruno.exclusao@example.com';
    const cod = (await app.inject({ method: 'POST', url: '/auth/codigo', payload: { email } })).json().codigo_demo;
    const bruno = (await app.inject({ method: 'POST', url: '/auth/entrar', payload: { email, codigo: cod } })).json().token as string;
    const brunoId = (await pool.query('SELECT id FROM usuario WHERE email = $1', [email])).rows[0].id;
    await app.inject({ method: 'PUT', url: '/perfil/foto', headers: auth(bruno), payload: { imagem: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' } });

    // Bruno ajuda no pedido da Ana e conversa com ela
    expect((await app.inject({ method: 'POST', url: `/mural/${pedidoId}/ofertas`, headers: auth(bruno), payload: { itens: [itens[1].id] } })).statusCode).toBe(201);
    const conv = (await app.inject({ method: 'GET', url: `/conversas?solicitacao_id=${pedidoId}`, headers: auth(bruno) })).json()[0].id;
    await app.inject({ method: 'POST', url: `/conversas/${conv}/mensagens`, headers: auth(bruno), payload: { texto: 'Levo o feijão.' } });

    // Sem código, ou com código errado, não exclui
    expect((await app.inject({ method: 'POST', url: '/perfil/excluir', headers: auth(bruno), payload: { codigo: '000000' } })).statusCode).toBe(401);
    const c2 = (await app.inject({ method: 'POST', url: '/perfil/excluir/codigo', headers: auth(bruno) })).json();
    expect(c2.email).toMatch(/\*/);
    const r = await app.inject({ method: 'POST', url: '/perfil/excluir', headers: auth(bruno), payload: { codigo: c2.codigo_demo } });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ ok: true, ajudas_canceladas: 1 });

    // A sessão aberta deixa de valer
    expect((await app.inject({ method: 'GET', url: '/perfil', headers: auth(bruno) })).statusCode).toBe(401);
    // Dados pessoais apagados; a linha fica anônima
    const u = (await pool.query('SELECT nome, email, telefone, cpf, excluido_em FROM usuario WHERE id = $1', [brunoId])).rows[0];
    expect(u).toMatchObject({ nome: 'Conta excluída', email: null, telefone: '', cpf: null });
    expect(u.excluido_em).not.toBeNull();
    for (const tabela of ['foto_usuario', 'notificacao', 'codigo_acesso', 'conta_social']) {
      expect((await pool.query(`SELECT count(*)::int AS n FROM ${tabela} WHERE usuario_id = $1`, [brunoId])).rows[0].n).toBe(0);
    }
    expect((await pool.query('SELECT count(*)::int AS n FROM conversa WHERE voluntario_id = $1', [brunoId])).rows[0].n).toBe(0);
    expect((await pool.query('SELECT count(*)::int AS n FROM mensagem WHERE autor_id = $1', [brunoId])).rows[0].n).toBe(0);

    // O item que ele ia levar volta para o mural, e a Ana é avisada
    const mural = (await app.inject({ method: 'GET', url: '/mural?abrangencia=brasil&limite=50', headers: auth(claudia) })).json() as { id: string; itens: (Item & { status: string })[] }[];
    expect(mural.find((p) => p.id === pedidoId)!.itens.find((i) => i.id === itens[1].id)!.status).toBe('aberto');
    const avisos = (await app.inject({ method: 'GET', url: '/notificacoes', headers: auth(ana) })).json();
    expect(avisos.some((n: { tipo: string; texto: string }) => n.tipo === 'ajuda_cancelada' && n.texto.includes(itens[1].descricao))).toBe(true);

    // Não entra mais e o e-mail fica livre para uma conta nova
    const nova = (await app.inject({ method: 'POST', url: '/auth/codigo', payload: { email } })).json();
    expect(nova.codigo_demo).toBeUndefined();
    const bairro = (await app.inject({ method: 'GET', url: '/auth/bairros' })).json()[0].id;
    const recriar = await app.inject({ method: 'POST', url: '/auth/cadastro', payload: { nome: 'Bruno Novo', email, telefone: '+5511990007777', bairro_id: bairro, aceite_termos: true } });
    expect(recriar.statusCode).toBe(201);
  });

  it('quem pediu exclui a conta: o pedido sai do mural e quem ia levar é avisado', async () => {
    const email = 'bruno.exclusao@example.com';
    const cod = (await app.inject({ method: 'POST', url: '/auth/codigo', payload: { email } })).json().codigo_demo;
    const bruno = (await app.inject({ method: 'POST', url: '/auth/entrar', payload: { email, codigo: cod } })).json().token as string;
    const p = (await app.inject({ method: 'POST', url: '/solicitacoes', headers: auth(bruno), payload: { relato: 'Preciso de roupas de frio para meus filhos pequenos' } })).json();
    const st = (await pool.query('SELECT status FROM solicitacao WHERE id = $1', [p.id])).rows[0].status;
    if (st === 'no_mural') {
      expect((await app.inject({ method: 'POST', url: `/mural/${p.id}/ofertas`, headers: auth(claudia), payload: {} })).statusCode).toBe(201);
    }
    const c = (await app.inject({ method: 'POST', url: '/perfil/excluir/codigo', headers: auth(bruno) })).json().codigo_demo;
    expect((await app.inject({ method: 'POST', url: '/perfil/excluir', headers: auth(bruno), payload: { codigo: c } })).statusCode).toBe(200);

    const s = (await pool.query('SELECT status FROM solicitacao WHERE id = $1', [p.id])).rows[0].status;
    expect(s).toBe('cancelada');
    expect((await pool.query('SELECT count(*)::int AS n FROM relato WHERE solicitacao_id = $1', [p.id])).rows[0].n).toBe(0);
    if (st === 'no_mural') {
      const avisos = (await app.inject({ method: 'GET', url: '/notificacoes', headers: auth(claudia) })).json();
      expect(avisos.some((n: { texto: string }) => n.texto.includes('quem pediu saiu do ELO'))).toBe(true);
    }
  });
});
