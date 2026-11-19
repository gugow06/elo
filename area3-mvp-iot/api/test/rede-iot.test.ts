import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CHAVES_DEMO, PONTOS_DEMO } from '../db/seed';
import { SlaService } from '../src/rede/sla.service';
import { auth, criarApp, entrar, TELEFONES } from './helpers';

// Ana mora no Jardim São Pedro (sem ponto próprio): a triagem sugere o ponto com mais espaço, o CRAS Jardim.
const PONTO = PONTOS_DEMO['ponto-jardim'];
const CHAVE = CHAVES_DEMO['ponto-jardim'];

describe.skipIf(!process.env.DATABASE_URL)('rede cidadã e Ponto de Coleta Inteligente', () => {
  let app: NestFastifyApplication;
  let pool: Pool;
  let ana: string;
  let claudia: string;
  let protocolo: string;
  let solicitacaoId: string;

  const evento = (payload: object, chave: string = CHAVE) =>
    app.inject({ method: 'POST', url: `/iot/pontos/${PONTO}/eventos`, headers: { 'x-device-key': chave }, payload });

  beforeAll(async () => {
    app = await criarApp();
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    ana = await entrar(app, TELEFONES.ana);
    claudia = await entrar(app, TELEFONES.claudia);
    const r = await app.inject({
      method: 'POST', url: '/solicitacoes', headers: auth(ana),
      payload: { relato: 'Perdi o emprego e preciso de uma cesta básica para meus dois filhos' },
    });
    ({ protocolo, id: solicitacaoId } = r.json());
    const { rows } = await pool.query('SELECT ponto_coleta_id FROM solicitacao WHERE id = $1', [solicitacaoId]);
    expect(rows[0].ponto_coleta_id).toBe(PONTO);
  });

  afterAll(async () => {
    await pool?.end();
    await app?.close();
  });

  it('T4: o mural nunca expõe endereço do cidadão, nome ou relato', async () => {
    const r = await app.inject({ method: 'GET', url: '/mural', headers: auth(claudia) });
    expect(r.statusCode).toBe(200);
    const texto = JSON.stringify(r.json());
    expect(r.json().length).toBeGreaterThan(0);
    expect(texto).not.toMatch(/Ana Paula|Ribeiro|Perdi o emprego|telefone|cpf|relato/i);
    expect(Object.keys(r.json()[0])).not.toContain('cidadao_id');
  });

  it('pedido vermelho nunca aparece no mural', async () => {
    await app.inject({
      method: 'POST', url: '/solicitacoes', headers: auth(ana),
      payload: { relato: 'Estamos há três dias sem comer, meus filhos estão com fome' },
    });
    const r = await app.inject({ method: 'GET', url: '/mural', headers: auth(claudia) });
    expect(r.json().every((p: { titulo: string }) => p.titulo !== 'Pedido de ajuda')).toBe(true);
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM solicitacao WHERE faixa = 'vermelha' AND status = 'no_mural'`);
    expect(rows[0].n).toBe(0);
  });

  it('voluntária assume o pedido e recebe o protocolo e as instruções do ponto', async () => {
    const r = await app.inject({ method: 'POST', url: `/mural/${solicitacaoId}/ofertas`, headers: auth(claudia) });
    expect(r.statusCode).toBe(201);
    expect(r.json().protocolo).toBe(protocolo);
    const de_novo = await app.inject({ method: 'POST', url: `/mural/${solicitacaoId}/ofertas`, headers: auth(claudia) });
    expect(de_novo.statusCode).toBe(404);
  });

  it('dispositivo com chave inválida é recusado', async () => {
    const r = await evento({ tipo: 'leitura_sensor', peso_kg: 80, temperatura_c: 24 }, 'chave-errada');
    expect(r.statusCode).toBe(401);
  });

  it('T5: protocolo inválido no ponto de coleta não altera nenhum pedido', async () => {
    const r = await evento({ tipo: 'entrega_depositada', protocolo: '000000', delta_peso_kg: 8, peso_kg: 44 });
    expect(r.statusCode).toBe(404);
    const { rows } = await pool.query('SELECT status FROM solicitacao WHERE id = $1', [solicitacaoId]);
    expect(rows[0].status).toBe('em_atendimento');
  });

  it('depósito sem variação de peso é recusado', async () => {
    const r = await evento({ tipo: 'entrega_depositada', protocolo, delta_peso_kg: 0.1, peso_kg: 36.1 });
    expect(r.statusCode).toBe(422);
  });

  it('T6: depósito com peso registra a entrega e gera a devolutiva "Sua ajuda chegou"', async () => {
    const conf = await app.inject({ method: 'GET', url: `/iot/pontos/${PONTO}/protocolos/${protocolo}`, headers: { 'x-device-key': CHAVE } });
    expect(conf.json().valido).toBe(true);

    const r = await evento({ tipo: 'entrega_depositada', protocolo, delta_peso_kg: 8.2, peso_kg: 44.2, temperatura_c: 24 });
    expect(r.statusCode).toBe(200);
    expect(r.json().lcd[0]).toBe('Entrega OK!');

    const ofertas = await app.inject({ method: 'GET', url: '/voluntario/ofertas', headers: auth(claudia) });
    expect(ofertas.json()[0].status).toBe('entregue');
    const notif = await app.inject({ method: 'GET', url: '/notificacoes', headers: auth(claudia) });
    expect(notif.json().some((n: { tipo: string }) => n.tipo === 'sua_ajuda_chegou')).toBe(true);
  });

  it('cidadã confirma a retirada, o pedido fecha resolvido pela rede e a voluntária recebe o desfecho', async () => {
    const r = await app.inject({ method: 'POST', url: `/solicitacoes/${solicitacaoId}/confirmar-recebimento`, headers: auth(ana) });
    expect(r.statusCode).toBe(200);
    const { rows } = await pool.query('SELECT status, desfecho FROM solicitacao WHERE id = $1', [solicitacaoId]);
    expect(rows[0]).toEqual({ status: 'concluida', desfecho: 'resolvida_rede' });
    const ofertas = await app.inject({ method: 'GET', url: '/voluntario/ofertas', headers: auth(claudia) });
    expect(ofertas.json()[0].desfecho_texto).toMatch(/Sua ajuda chegou/);
  });

  it('leitura com temperatura alta gera alerta e atualiza o estoque', async () => {
    const r = await evento({ tipo: 'leitura_sensor', peso_kg: 90, temperatura_c: 33, umidade_pct: 60 });
    expect(r.json().led_alerta).toBe(true);
    const pontos = await app.inject({ method: 'GET', url: '/pontos', headers: auth(claudia) });
    const vilaNova = pontos.json().find((p: { id: string }) => p.id === PONTO);
    expect(vilaNova.estoque_kg).toBe(90);
    expect(vilaNova.alertas[0]).toMatch(/Temperatura alta/);
  });

  it('P5: pedido verde sem voluntário após o SLA escala para o CRAS', async () => {
    const escalados = await app.get(SlaService).escalar(1); // pedidos do seed estão no mural há 6 e 20 horas
    expect(escalados).toBeGreaterThanOrEqual(2);
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM solicitacao WHERE escalado AND status = 'na_fila_tecnica'`);
    expect(rows[0].n).toBeGreaterThanOrEqual(2);
  });
});
