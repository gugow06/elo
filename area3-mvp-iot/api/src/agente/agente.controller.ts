import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Pool } from 'pg';
import { z } from 'zod';
import { AuthGuard, Perfis, SessaoAtual } from '../auth/auth.guard';
import { Sessao } from '../auth/sessao';
import { auditar } from '../infra/auditoria';
import { POOL } from '../infra/banco.module';
import { EventosService } from '../infra/eventos.service';
import { notificar } from '../infra/notificacoes';
import { validar } from '../infra/validacao';
import { conferirCodigo, registrarRetirada } from '../rede/retirada';
import { STATUS_PARA_CIDADAO } from '../solicitacoes/textos';

const Protocolo = z.string().trim().regex(/^\d{6}$/, 'O protocolo tem 6 números');
const Retirada = z.object({
  ponto_coleta_id: z.string().uuid('Escolha o ponto de coleta'),
  codigo: z.string().trim().regex(/^\d{4}$/, 'O código de retirada tem 4 números'),
  // Sem lista: tudo o que chegou ao ponto e ainda não foi retirado
  itens: z.array(z.string().uuid()).max(50).optional(),
});

const Entrega = z.object({
  ponto_coleta_id: z.string().uuid('Escolha o ponto de coleta'),
  // Quem trouxe, entre as pessoas que estão ajudando no app (opcional: pode ser alguém sem o app)
  oferta_id: z.string().uuid().nullable().optional(),
  itens: z
    .array(z.object({ item_id: z.string().uuid(), quantidade: z.number().int().min(1, 'Quantidade mínima: 1').max(999) }))
    .min(1, 'Marque pelo menos um item que a pessoa trouxe')
    .max(50),
});

/** Filtros do registro (log) de entregas e retiradas. */
const FiltroRegistro = z.object({
  ponto_coleta_id: z.string().uuid().optional(),
  tipo: z.enum(['entrega', 'retirada', 'codigo_errado']).optional(),
  protocolo: z.string().trim().regex(/^\d{6}$/, 'O protocolo tem 6 números').optional(),
  limite: z.coerce.number().int().min(1).max(500).default(100),
});

/** Pedido que ainda pode receber doação: no mural, em atendimento ou já com algo no ponto. */
const RECEBE = ['no_mural', 'em_atendimento', 'entregue'];

type ItemAgente = { id: string; descricao: string; status: string; quantidade: number; quem_leva: string[] };
type Ajudante = { oferta_id: string; nome: string; itens: string[] };

/**
 * Agente do ponto de coleta (painel). Digita o protocolo que a pessoa informa ao chegar, vê o que o
 * pedido precisa e quem combinou levar o quê no app, e marca o que chegou, com a quantidade.
 * O app de quem pediu e de quem ajudou é atualizado na hora. Nunca mostra nome, endereço ou relato
 * de quem pediu: só o necessário para receber a doação.
 */
@Controller('agente')
@UseGuards(AuthGuard)
@Perfis('agente', 'tecnico', 'gestor')
export class AgenteController {
  constructor(
    @Inject(POOL) private readonly pool: Pool,
    @Inject(EventosService) private readonly eventos: EventosService,
  ) {}

  /** Pontos de coleta do município, para o agente dizer onde está. */
  @Get('pontos')
  async pontos(@SessaoAtual() sessao: Sessao) {
    const { rows } = await this.pool.query(
      `SELECT p.id, p.nome, p.endereco FROM ponto_coleta p
       LEFT JOIN local_rede l ON l.ponto_coleta_id = p.id
       WHERE p.municipio_id = $1 AND coalesce(l.ativo, true)
       ORDER BY p.nome`,
      [sessao.municipioId],
    );
    return rows;
  }

  /**
   * Registro (log) do município: cada doação recebida, cada retirada e cada tentativa de retirada
   * com código errado, a mais recente primeiro. Mostra quando, onde, quem registrou (agente, sensor
   * ou app), quem trouxe e o quê. Nunca mostra nome, endereço ou relato de quem pediu.
   */
  @Get('registro')
  async registro(@SessaoAtual() sessao: Sessao, @Query() query: unknown) {
    const f = validar(FiltroRegistro, query ?? {});
    const { rows } = await this.pool.query(
      `SELECT * FROM (
         SELECT 'entrega' AS tipo, e.id::text AS id, e.criado_em, s.protocolo, s.titulo, p.nome AS ponto_coleta, e.ponto_coleta_id,
                e.origem, ag.nome AS registrado_por, split_part(v.nome, ' ', 1) AS trouxe,
                coalesce((SELECT json_agg(json_build_object('descricao', i.descricao, 'quantidade', ei.quantidade) ORDER BY i.ordem)
                          FROM entrega_item ei JOIN item_solicitacao i ON i.id = ei.item_id WHERE ei.entrega_id = e.id), '[]'::json) AS itens
         FROM entrega e
         JOIN solicitacao s ON s.id = e.solicitacao_id
         LEFT JOIN ponto_coleta p ON p.id = e.ponto_coleta_id
         LEFT JOIN usuario ag ON ag.id = e.registrado_por
         LEFT JOIN usuario v ON v.id = e.voluntario_id
         WHERE s.municipio_id = $1
         UNION ALL
         SELECT 'retirada', r.id::text, r.criado_em, s.protocolo, s.titulo, p.nome, r.ponto_coleta_id,
                r.origem, CASE WHEN r.origem = 'app' THEN NULL ELSE ag.nome END, NULL,
                coalesce((SELECT json_agg(json_build_object('descricao', i.descricao, 'quantidade', NULLIF(i.quantidade_entregue, 0)) ORDER BY i.ordem)
                          FROM retirada_item ri JOIN item_solicitacao i ON i.id = ri.item_id WHERE ri.retirada_id = r.id), '[]'::json)
         FROM retirada r
         JOIN solicitacao s ON s.id = r.solicitacao_id
         LEFT JOIN ponto_coleta p ON p.id = r.ponto_coleta_id
         LEFT JOIN usuario ag ON ag.id = r.registrado_por
         WHERE s.municipio_id = $1
         UNION ALL
         SELECT 'codigo_errado', a.id::text, a.criado_em, s.protocolo, s.titulo, NULL, NULL,
                CASE WHEN ag.perfil IN ('agente', 'tecnico', 'gestor') THEN 'painel' ELSE 'sensor' END, ag.nome, NULL, '[]'::json
         FROM evento_auditoria a
         JOIN solicitacao s ON s.id::text = a.entidade_id
         LEFT JOIN usuario ag ON ag.id = a.usuario_id
         WHERE a.acao = 'codigo_retirada_errado' AND s.municipio_id = $1
       ) r
       WHERE ($2::uuid IS NULL OR r.ponto_coleta_id = $2)
         AND ($3::text IS NULL OR r.tipo = $3)
         AND ($4::text IS NULL OR r.protocolo = $4)
       ORDER BY r.criado_em DESC
       LIMIT $5`,
      [sessao.municipioId, f.ponto_coleta_id ?? null, f.tipo ?? null, f.protocolo ?? null, f.limite],
    );
    return rows.map(({ ponto_coleta_id: _, ...r }) => r);
  }

  @Get('pedidos/:protocolo')
  async pedido(@SessaoAtual() sessao: Sessao, @Param('protocolo') protocoloBruto: string) {
    const protocolo = validar(Protocolo, protocoloBruto);
    return this.carregar(sessao.municipioId, protocolo);
  }

  @Post('pedidos/:protocolo/entregas')
  async registrar(@SessaoAtual() sessao: Sessao, @Param('protocolo') protocoloBruto: string, @Body() corpo: unknown) {
    const protocolo = validar(Protocolo, protocoloBruto);
    const d = validar(Entrega, corpo);
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      const s = (await c.query<{ id: string; status: string; cidadao_id: string; municipio_id: string; codigo_retirada: string }>(
        `SELECT id, status, cidadao_id, municipio_id, codigo_retirada FROM solicitacao WHERE municipio_id = $1 AND protocolo = $2 FOR UPDATE`,
        [sessao.municipioId, protocolo],
      )).rows[0];
      if (!s) throw new NotFoundException('Protocolo não encontrado neste município. Confira os 6 números com a pessoa.');
      if (!RECEBE.includes(s.status)) throw new BadRequestException(`Este pedido não recebe mais doações: ${STATUS_PARA_CIDADAO[s.status].toLowerCase()}.`);

      const ponto = (await c.query<{ id: string; nome: string }>(
        'SELECT id, nome FROM ponto_coleta WHERE id = $1 AND municipio_id = $2', [d.ponto_coleta_id, sessao.municipioId],
      )).rows[0];
      if (!ponto) throw new BadRequestException('Ponto de coleta não encontrado.');

      // Soma por item (o mesmo item pode vir repetido na lista)
      const qtd = new Map<string, number>();
      for (const i of d.itens) qtd.set(i.item_id, Math.min(999, (qtd.get(i.item_id) ?? 0) + i.quantidade));
      const validos = (await c.query<{ id: string; descricao: string; obtido_em: Date | null }>(
        'SELECT id, descricao, obtido_em FROM item_solicitacao WHERE solicitacao_id = $1 AND id = ANY($2::uuid[]) ORDER BY ordem',
        [s.id, [...qtd.keys()]],
      )).rows;
      if (validos.length !== qtd.size) throw new BadRequestException('Algum item não é deste pedido. Atualize e marque de novo.');
      if (validos.some((v) => v.obtido_em)) throw new BadRequestException('Quem pediu já recebeu um desses itens. Atualize a tela.');

      let voluntarioId: string | null = null;
      if (d.oferta_id) {
        const o = await c.query<{ voluntario_id: string }>('SELECT voluntario_id FROM oferta WHERE id = $1 AND solicitacao_id = $2 AND ativa', [d.oferta_id, s.id]);
        if (!o.rows[0]) throw new BadRequestException('Essa pessoa não está ajudando neste pedido.');
        voluntarioId = o.rows[0].voluntario_id;
      }

      const entrega = (await c.query<{ id: string }>(
        `INSERT INTO entrega (solicitacao_id, ponto_coleta_id, origem, registrado_por, voluntario_id)
         VALUES ($1, $2, 'painel', $3, $4) RETURNING id`,
        [s.id, ponto.id, sessao.usuarioId, voluntarioId],
      )).rows[0].id;
      for (const [itemId, q] of qtd) {
        await c.query('INSERT INTO entrega_item (entrega_id, item_id, quantidade) VALUES ($1, $2, $3)', [entrega, itemId, q]);
        await c.query(
          `UPDATE item_solicitacao SET entregue_em = coalesce(entregue_em, now()), quantidade_entregue = least(quantidade_entregue + $2, 999000)
           WHERE id = $1`,
          [itemId, q],
        );
      }

      // Tudo no ponto (ou já recebido): o pedido passa para "chegou ao ponto, pode retirar".
      // A retirada passa a ser onde a doação chegou (pode ser outro ponto que não o combinado)
      const faltam = (await c.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM item_solicitacao WHERE solicitacao_id = $1 AND entregue_em IS NULL AND obtido_em IS NULL', [s.id],
      )).rows[0].n;
      await c.query(
        `UPDATE solicitacao SET status = CASE WHEN $2 THEN 'entregue'::status_pedido ELSE status END,
                ponto_coleta_id = $3, primeira_resposta_em = coalesce(primeira_resposta_em, now())
         WHERE id = $1`,
        [s.id, faltam === 0, ponto.id],
      );

      const lista = validos.map((v) => `${v.descricao}${qtd.get(v.id)! > 1 ? ` (${qtd.get(v.id)})` : ''}`).join(', ');
      await notificar(c, {
        usuarioId: s.cidadao_id,
        solicitacaoId: s.id,
        tipo: 'doacao_disponivel',
        texto: `Chegou ao ${ponto.nome}: ${lista}. Para retirar, informe o protocolo ${protocolo} e o código de retirada ${s.codigo_retirada}.`,
      });
      // Avisa quem trouxe; sem saber quem, quem tinha combinado levar esses itens
      const ajudantes = voluntarioId
        ? [voluntarioId]
        : (await c.query<{ voluntario_id: string }>(
            `SELECT DISTINCT o.voluntario_id FROM oferta o JOIN oferta_item oi ON oi.oferta_id = o.id
             WHERE o.solicitacao_id = $1 AND o.ativa AND oi.item_id = ANY($2::uuid[])`,
            [s.id, [...qtd.keys()]],
          )).rows.map((r) => r.voluntario_id);
      for (const v of ajudantes) {
        await notificar(c, {
          usuarioId: v,
          solicitacaoId: s.id,
          tipo: 'sua_ajuda_chegou',
          texto: `Sua ajuda chegou ao ${ponto.nome}! A família foi avisada para retirar. Obrigado.`,
        });
      }
      await auditar(c, { usuarioId: sessao.usuarioId, acao: 'registrar_entrega', entidade: 'solicitacao', entidadeId: s.id, detalhe: { itens: qtd.size, ponto: ponto.id } });
      await c.query('COMMIT');
      this.eventos.emitir({ tipo: 'entrega_registrada', municipioId: s.municipio_id, pontoId: ponto.id, solicitacaoId: s.id, protocolo, dados: { origem: 'painel' } });
      return { ok: true, mensagem: `Entrega registrada: ${lista}. Avisamos quem pediu.`, pedido: await this.carregar(sessao.municipioId, protocolo) };
    } catch (erro) {
      await c.query('ROLLBACK').catch(() => undefined);
      throw erro;
    } finally {
      c.release();
    }
  }

  /**
   * Quem pediu retira a doação no ponto: informa o protocolo e o código de retirada (4 números que
   * só ela tem; quem ajudou conhece o protocolo, não o código). Funciona sem o app de quem pediu.
   */
  @Post('pedidos/:protocolo/retiradas')
  async retirar(@SessaoAtual() sessao: Sessao, @Param('protocolo') protocoloBruto: string, @Body() corpo: unknown) {
    const protocolo = validar(Protocolo, protocoloBruto);
    const d = validar(Retirada, corpo);
    const s = (await this.pool.query<{ id: string; status: string; cidadao_id: string; municipio_id: string; codigo_retirada: string }>(
      'SELECT id, status, cidadao_id, municipio_id, codigo_retirada FROM solicitacao WHERE municipio_id = $1 AND protocolo = $2',
      [sessao.municipioId, protocolo],
    )).rows[0];
    if (!s) throw new NotFoundException('Protocolo não encontrado neste município. Confira os 6 números com a pessoa.');
    if (!RECEBE.includes(s.status)) throw new BadRequestException(`Este pedido já foi encerrado: ${STATUS_PARA_CIDADAO[s.status].toLowerCase()}.`);
    // Fora da transação: a tentativa errada fica registrada e conta para o limite
    if (!(await conferirCodigo(this.pool, s, d.codigo, sessao.usuarioId))) {
      throw new BadRequestException('Código de retirada errado. Ele está no app de quem pediu, em "Meus pedidos", ou na mensagem que a pessoa recebeu.');
    }
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      await c.query('SELECT 1 FROM solicitacao WHERE id = $1 FOR UPDATE', [s.id]);
      const prontos = (await c.query<{ id: string }>(
        'SELECT id FROM item_solicitacao WHERE solicitacao_id = $1 AND entregue_em IS NOT NULL AND obtido_em IS NULL', [s.id],
      )).rows.map((r) => r.id);
      const escolhidos = d.itens ?? prontos;
      if (!escolhidos.length) throw new BadRequestException('Nada deste pedido chegou ao ponto ainda.');
      if (escolhidos.some((i) => !prontos.includes(i))) throw new BadRequestException('Só dá para retirar o que já chegou ao ponto. Atualize a tela.');
      const r = await registrarRetirada(c, { solicitacaoId: s.id, protocolo, origem: 'painel', pontoId: d.ponto_coleta_id, registradoPor: sessao.usuarioId, itens: escolhidos });
      await notificar(c, {
        usuarioId: s.cidadao_id,
        solicitacaoId: s.id,
        tipo: 'retirada_registrada',
        texto: `Retirada registrada no ponto de coleta: ${r.itens.join(', ')}.${r.concluido ? ' Seu pedido foi concluído. Obrigado por usar o ELO!' : ''}`,
      });
      await c.query('COMMIT');
      this.eventos.emitir({ tipo: 'solicitacao_atualizada', municipioId: s.municipio_id, solicitacaoId: s.id, protocolo });
      return {
        ok: true,
        concluido: r.concluido,
        mensagem: `Retirada registrada: ${r.itens.join(', ')}.${r.concluido ? ' Pedido concluído; avisamos quem ajudou.' : ''}`,
        pedido: await this.carregar(sessao.municipioId, protocolo),
      };
    } catch (erro) {
      await c.query('ROLLBACK').catch(() => undefined);
      throw erro;
    } finally {
      c.release();
    }
  }

  /** O pedido do jeito que o agente precisa ver (nunca o código de retirada). */
  private async carregar(municipioId: string, protocolo: string) {
    const s = (await this.pool.query<{ id: string; protocolo: string; titulo: string; categoria: string; status: string; bairro: string; ponto_coleta: string | null; criado_em: Date }>(
      `SELECT s.id, s.protocolo, s.titulo, s.categoria, s.status, b.nome AS bairro, p.nome AS ponto_coleta, s.criado_em
       FROM solicitacao s JOIN bairro b ON b.id = s.bairro_id LEFT JOIN ponto_coleta p ON p.id = s.ponto_coleta_id
       WHERE s.municipio_id = $1 AND s.protocolo = $2`,
      [municipioId, protocolo],
    )).rows[0];
    if (!s) throw new NotFoundException('Protocolo não encontrado neste município. Confira os 6 números com a pessoa.');

    const itens = (await this.pool.query<ItemAgente>(
      `SELECT i.id, i.descricao, i.quantidade_entregue AS quantidade,
              CASE WHEN i.obtido_em IS NOT NULL THEN 'obtido' WHEN i.entregue_em IS NOT NULL THEN 'entregue'
                   WHEN EXISTS (SELECT 1 FROM oferta_item oi JOIN oferta o ON o.id = oi.oferta_id WHERE oi.item_id = i.id AND o.ativa) THEN 'comprometido'
                   ELSE 'aberto' END AS status,
              coalesce((SELECT array_agg(split_part(u.nome, ' ', 1) ORDER BY o.criado_em)
                        FROM oferta_item oi JOIN oferta o ON o.id = oi.oferta_id JOIN usuario u ON u.id = o.voluntario_id
                        WHERE oi.item_id = i.id AND o.ativa), '{}') AS quem_leva
       FROM item_solicitacao i WHERE i.solicitacao_id = $1 ORDER BY i.ordem`,
      [s.id],
    )).rows;
    const ajudantes = (await this.pool.query<Ajudante>(
      `SELECT o.id AS oferta_id, split_part(u.nome, ' ', 1) AS nome,
              coalesce((SELECT array_agg(oi.item_id::text) FROM oferta_item oi WHERE oi.oferta_id = o.id), '{}') AS itens
       FROM oferta o JOIN usuario u ON u.id = o.voluntario_id
       WHERE o.solicitacao_id = $1 AND o.ativa ORDER BY o.criado_em`,
      [s.id],
    )).rows;
    const entregas = (await this.pool.query(
      `SELECT e.criado_em, e.origem, p.nome AS ponto_coleta,
              coalesce((SELECT json_agg(json_build_object('descricao', i.descricao, 'quantidade', ei.quantidade) ORDER BY i.ordem)
                        FROM entrega_item ei JOIN item_solicitacao i ON i.id = ei.item_id WHERE ei.entrega_id = e.id), '[]'::json) AS itens
       FROM entrega e JOIN ponto_coleta p ON p.id = e.ponto_coleta_id
       WHERE e.solicitacao_id = $1 ORDER BY e.criado_em DESC`,
      [s.id],
    )).rows;
    const retiradas = (await this.pool.query(
      `SELECT r.criado_em, r.origem, p.nome AS ponto_coleta,
              coalesce((SELECT json_agg(i.descricao ORDER BY i.ordem) FROM retirada_item ri JOIN item_solicitacao i ON i.id = ri.item_id
                        WHERE ri.retirada_id = r.id), '[]'::json) AS itens
       FROM retirada r LEFT JOIN ponto_coleta p ON p.id = r.ponto_coleta_id
       WHERE r.solicitacao_id = $1 ORDER BY r.criado_em DESC`,
      [s.id],
    )).rows;
    return {
      ...s,
      status_texto: STATUS_PARA_CIDADAO[s.status],
      recebe_doacao: RECEBE.includes(s.status),
      // Chegou ao ponto e ainda não foi retirado: o agente pode registrar a retirada (com o código)
      pode_retirar: RECEBE.includes(s.status) && itens.some((i) => i.status === 'entregue'),
      retiradas,
      itens,
      ajudantes,
      entregas,
    };
  }
}
