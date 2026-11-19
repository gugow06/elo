import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, Inject, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { PoolClient } from 'pg';
import { Pool } from 'pg';
import { z } from 'zod';
import { AuthGuard, Perfis, SessaoAtual } from '../auth/auth.guard';
import { Sessao } from '../auth/sessao';
import { auditar } from '../infra/auditoria';
import { POOL } from '../infra/banco.module';
import { EventosService } from '../infra/eventos.service';
import { notificar } from '../infra/notificacoes';
import { STATUS_PARA_CIDADAO } from '../solicitacoes/textos';
import { CATEGORIAS_INTEIRAS, SQL_VISIVEL, sqlItens } from './itens';
import { registrarRetirada } from './retirada';
import { validar } from '../infra/validacao';

const FiltroMural = z.object({
  bairro: z.string().max(80).optional(),
  uf: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'UF inválida').optional(),
  municipio: z.string().uuid('Cidade inválida').optional(),
  categoria: z.enum(['alimento', 'roupa', 'movel', 'material_escolar', 'apoio_idoso', 'transporte', 'outro']).optional(),
  // "Prioridade" = quem espera há mais tempo (F7-D11): a faixa de risco nunca é mostrada no app
  ordem: z.enum(['bairro', 'recentes', 'aguardando']).default('bairro'),
  // "brasil": todos os pedidos, de qualquer lugar ("Ver todos" sem estado ou cidade escolhidos)
  abrangencia: z.enum(['municipio', 'brasil']).default('municipio'),
  // Localização do aparelho (aproximada), só para ordenar por distância; não é guardada
  lat: z.coerce.number().min(-34).max(6).optional(),
  lon: z.coerce.number().min(-74).max(-34).optional(),
  // Com lat/lon: só pedidos até essa distância (Início: "perto de você")
  raio_km: z.coerce.number().min(1).max(500).optional(),
  pagina: z.coerce.number().int().min(0).max(1000).default(0),
  limite: z.coerce.number().int().min(1).max(50).default(30),
});

const Oferta = z.object({ itens: z.array(z.string().uuid()).max(50).optional() });
const MarcarItem = z.object({ obtido: z.boolean() });

const ORDENS = {
  // Mais perto primeiro: meu bairro, minha cidade, meu estado, depois o resto do Brasil
  bairro: '(s.bairro_id = $3::uuid) DESC, (s.municipio_id = $9::uuid) DESC, (m.uf = (SELECT uf FROM municipio WHERE id = $9::uuid)) DESC, s.criado_em',
  recentes: 's.criado_em DESC',
  aguardando: 's.criado_em ASC',
} as const;

/** Distância (km, aproximada) de onde o aparelho está até o bairro (ou o centro da cidade) do pedido. */
const SQL_DISTANCIA =
  '(111.32 * sqrt((coalesce(b.latitude, m.latitude) - $10::float) ^ 2 + ((coalesce(b.longitude, m.longitude) - $11::float) * cos(radians($10::float))) ^ 2))';
/** Mais perto de onde o aparelho está. */
const ORDEM_DISTANCIA = `${SQL_DISTANCIA} NULLS LAST, s.criado_em`;

/**
 * Rede cidadã: mural do bairro, oferta de ajuda e devolutiva.
 * RS-01 / P3: o mural nunca expõe endereço, nome do cidadão ou relato.
 */
@Controller()
@UseGuards(AuthGuard)
export class RedeController {
  constructor(
    @Inject(POOL) private readonly pool: Pool,
    @Inject(EventosService) private readonly eventos: EventosService,
  ) {}

  /**
   * Mural (RF-401), lista equivalente ao mapa (RF-402). Sem filtro: o município do usuário.
   * Com `uf` ou `municipio`: pedidos desse estado ou cidade. Com `abrangencia=brasil`: todos os pedidos
   * do Brasil, os mais perto primeiro.
   * Nunca expõe endereço, nome, relato ou faixa de risco.
   */
  @Get('mural')
  @Perfis('voluntario', 'cidadao')
  async mural(@SessaoAtual() sessao: Sessao, @Query() query: unknown) {
    const f = validar(FiltroMural, query);
    const municipio = f.municipio ?? (f.uf || f.abrangencia === 'brasil' ? null : sessao.municipioId);
    const perto = f.lat != null && f.lon != null;
    const { rows } = await this.pool.query(
      `SELECT s.id, s.titulo, s.categoria, s.criado_em, s.status,
              b.nome AS bairro, b.slug AS bairro_slug, m.nome AS municipio, m.uf,
              p.nome AS ponto_coleta, p.endereco AS ponto_coleta_endereco,
              round(extract(epoch FROM now() - s.criado_em) / 3600, 1) AS horas_no_mural, ${sqlItens('$4')},
              ${perto ? `round(${SQL_DISTANCIA}::numeric, 1)::float` : 'NULL::float'} AS distancia_km
       FROM solicitacao s
       JOIN bairro b ON b.id = s.bairro_id
       JOIN municipio m ON m.id = s.municipio_id
       LEFT JOIN ponto_coleta p ON p.id = s.ponto_coleta_id
       WHERE ${SQL_VISIVEL}
         AND ($1::uuid IS NULL OR s.municipio_id = $1)
         AND ($5::text IS NULL OR m.uf = $5)
         AND ($2::text IS NULL OR b.slug = $2)
         AND ($6::categoria_pedido IS NULL OR s.categoria = $6)
         AND s.cidadao_id <> $4 AND ($3::uuid IS NULL OR true) AND ($9::uuid IS NULL OR true)
         AND ($10::float IS NULL OR true) AND ($11::float IS NULL OR true)
         AND ${perto && f.raio_km != null ? `${SQL_DISTANCIA} <= $12::float` : '($12::float IS NULL OR true)'}
       ORDER BY ${f.ordem === 'bairro' && perto ? ORDEM_DISTANCIA : ORDENS[f.ordem]}
       LIMIT $7 OFFSET $8`,
      [municipio, f.bairro ?? null, sessao.bairroId, sessao.usuarioId, f.uf ?? null, f.categoria ?? null, f.limite, f.pagina * f.limite, sessao.municipioId,
        f.lat ?? null, f.lon ?? null, f.raio_km ?? null],
    );
    return rows;
  }

  /** Contagem por bairro: base da visão "mapa", sem nenhum ponto exato. */
  @Get('mural/bairros')
  @Perfis('voluntario', 'cidadao')
  async muralPorBairro(@SessaoAtual() sessao: Sessao) {
    const { rows } = await this.pool.query(
      `SELECT b.nome AS bairro, b.slug, count(s.id)::int AS pedidos
       FROM bairro b
       LEFT JOIN solicitacao s ON s.bairro_id = b.id AND ${SQL_VISIVEL}
       WHERE b.municipio_id = $1
       GROUP BY b.nome, b.slug ORDER BY pedidos DESC, b.nome`,
      [sessao.municipioId],
    );
    return rows;
  }

  /**
   * Ajudar com um pedido (RF-403), menos o próprio. Oferta por item (D3): a pessoa escolhe os itens
   * que vai levar; sem escolha, leva todos os que estão abertos. Móvel: uma pessoa leva tudo.
   * Com todos os itens com alguém levando, o pedido fica em atendimento, mas continua visível até
   * quem pediu encerrar.
   */
  @Post('mural/:id/ofertas')
  @Perfis('voluntario', 'cidadao')
  async oferecer(@SessaoAtual() sessao: Sessao, @Param('id') id: string, @Body() corpo: unknown) {
    const { itens: pedidos } = validar(Oferta, corpo ?? {});
    const cliente = await this.pool.connect();
    try {
      await cliente.query('BEGIN');
      const { rows } = await cliente.query<{ id: string; protocolo: string; cidadao_id: string; municipio_id: string; titulo: string; categoria: string; ponto: string | null; endereco: string | null }>(
        `SELECT s.id, s.protocolo, s.cidadao_id, s.municipio_id, s.titulo, s.categoria, p.nome AS ponto, p.endereco
         FROM solicitacao s LEFT JOIN ponto_coleta p ON p.id = s.ponto_coleta_id
         WHERE s.id = $1 AND ${SQL_VISIVEL}
         FOR UPDATE OF s`,
        [id],
      );
      const s = rows[0];
      if (!s) throw new NotFoundException('Este pedido não está mais disponível no mural.');
      if (s.cidadao_id === sessao.usuarioId) throw new BadRequestException('Este pedido é seu. Outra pessoa do bairro vai ajudar.');

      const abertos = (await this.itensAbertos(cliente, id)).map((r) => r.id);
      let escolhidos: string[];
      if (CATEGORIAS_INTEIRAS.has(s.categoria)) {
        const algum = await cliente.query('SELECT 1 FROM oferta WHERE solicitacao_id = $1 AND ativa', [id]);
        if (algum.rowCount) throw new ConflictException('Outra pessoa já vai ajudar com este pedido.');
        escolhidos = abertos;
      } else if (pedidos?.length) {
        const fechados = pedidos.filter((x) => !abertos.includes(x));
        if (fechados.length) throw new ConflictException('Alguém já vai levar um dos itens escolhidos. Atualize e escolha de novo.');
        escolhidos = [...new Set(pedidos)];
      } else {
        escolhidos = abertos;
      }
      if (!escolhidos.length) throw new ConflictException('Todos os itens deste pedido já têm alguém levando.');

      // Uma oferta por pessoa: se ela já ajuda neste pedido, só ganha mais itens
      const oferta = (await cliente.query<{ id: string }>(
        `INSERT INTO oferta (solicitacao_id, voluntario_id) VALUES ($1, $2)
         ON CONFLICT (solicitacao_id, voluntario_id) WHERE ativa DO UPDATE SET ativa = true
         RETURNING id`,
        [id, sessao.usuarioId],
      )).rows[0].id;
      await cliente.query(
        'INSERT INTO oferta_item (oferta_id, item_id) SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING',
        [oferta, escolhidos],
      );
      const restantes = await this.itensAbertos(cliente, id);
      await cliente.query(
        `UPDATE solicitacao SET status = CASE WHEN $2 = 0 THEN 'em_atendimento'::status_pedido ELSE status END,
                primeira_resposta_em = coalesce(primeira_resposta_em, now())
         WHERE id = $1`,
        [id, restantes.length],
      );
      const descricoes = (await cliente.query<{ descricao: string }>(
        'SELECT descricao FROM item_solicitacao WHERE id = ANY($1::uuid[]) ORDER BY ordem', [escolhidos],
      )).rows.map((r) => r.descricao);
      await notificar(cliente, {
        usuarioId: s.cidadao_id,
        solicitacaoId: id,
        tipo: 'voluntario_assumiu',
        texto: `Uma pessoa vai ajudar com o pedido ${s.protocolo}: ${descricoes.join(', ')}. A doação será entregue no ${s.ponto ?? 'ponto de coleta'}.`,
      });
      await auditar(cliente, { usuarioId: sessao.usuarioId, acao: 'oferecer_ajuda', entidade: 'solicitacao', entidadeId: id, detalhe: { itens: escolhidos.length } });
      await cliente.query('COMMIT');
      this.eventos.emitir({ tipo: 'solicitacao_atualizada', municipioId: s.municipio_id, solicitacaoId: id, protocolo: s.protocolo });

      return {
        protocolo: s.protocolo,
        titulo: s.titulo,
        itens: descricoes,
        ponto_coleta: { nome: s.ponto, endereco: s.endereco },
        instrucoes: `Leve ${descricoes.join(', ')} ao ${s.ponto}. Lá, digite o protocolo ${s.protocolo} no teclado do ponto e coloque a doação na balança.`,
      };
    } catch (erro) {
      await cliente.query('ROLLBACK');
      throw erro;
    } finally {
      cliente.release();
    }
  }

  /** Pedidos assumidos pelo voluntário, com desfecho (P6: quem ajuda recebe o desfecho). */
  @Get('voluntario/ofertas')
  @Perfis('voluntario', 'cidadao')
  async minhasOfertas(@SessaoAtual() sessao: Sessao) {
    const { rows } = await this.pool.query(
      `SELECT o.id AS oferta_id, s.id AS solicitacao_id, s.protocolo, s.titulo, s.status, s.criado_em, o.criado_em AS assumido_em,
              b.nome AS bairro, m.nome AS municipio, m.uf, p.nome AS ponto_coleta, p.endereco AS ponto_coleta_endereco,
              l.horario AS ponto_coleta_horario, l.telefone AS ponto_coleta_telefone,
              l.latitude::float AS ponto_coleta_latitude, l.longitude::float AS ponto_coleta_longitude,
              e.criado_em AS entregue_em, e.origem AS entrega_origem, ${sqlItens('$1')}
       FROM oferta o
       JOIN solicitacao s ON s.id = o.solicitacao_id
       JOIN bairro b ON b.id = s.bairro_id
       JOIN municipio m ON m.id = s.municipio_id
       LEFT JOIN ponto_coleta p ON p.id = s.ponto_coleta_id
       LEFT JOIN local_rede l ON l.ponto_coleta_id = p.id
       LEFT JOIN LATERAL (SELECT criado_em, origem FROM entrega WHERE solicitacao_id = s.id ORDER BY criado_em DESC LIMIT 1) e ON true
       WHERE o.voluntario_id = $1 AND o.ativa
       ORDER BY o.criado_em DESC`,
      [sessao.usuarioId],
    );
    return rows.map((r) => {
      const itens = r.itens as { descricao: string; meu: boolean; status: string }[];
      const meus = itens.filter((i) => i.meu).map((i) => i.descricao);
      // Concluído sem entrega nem item meu recebido = quem pediu encerrou antes de a doação chegar
      const chegou = !!r.entregue_em || itens.some((i) => i.meu && i.status === 'obtido');
      return {
        ...r,
        desfecho_texto:
          r.status === 'concluida' && chegou
            ? 'Sua ajuda chegou! A família já retirou a doação. Obrigado.'
            : r.status === 'concluida' || r.status === 'cancelada'
              ? 'Quem pediu encerrou o pedido. Se você ainda não levou a doação, não precisa mais levar. Obrigado!'
              : r.status === 'entregue'
                ? 'Sua ajuda chegou ao ponto de coleta. A família foi avisada para retirar.'
                : 'Aguardando você levar a doação ao ponto de coleta.',
        instrucoes: `Leve ${meus.length ? meus.join(', ') : 'a doação'} ao ${r.ponto_coleta ?? 'ponto de coleta'}. Lá, digite o protocolo ${r.protocolo} no teclado do ponto e coloque a doação na balança.`,
      };
    });
  }

  /** Cidadão confirma que retirou a doação (RF-407). Fecha o pedido e avisa o voluntário. */
  @Post('solicitacoes/:id/confirmar-recebimento')
  @HttpCode(200)
  @Perfis('cidadao', 'voluntario')
  async confirmarRecebimento(@SessaoAtual() sessao: Sessao, @Param('id') id: string) {
    if (!z.string().uuid().safeParse(id).success) throw new BadRequestException('Só é possível confirmar pedidos que já chegaram ao ponto de coleta.');
    const c = await this.pool.connect();
    let protocolo: string;
    try {
      await c.query('BEGIN');
      const r = await c.query<{ protocolo: string; ponto_coleta_id: string | null }>(
        `SELECT protocolo, ponto_coleta_id FROM solicitacao WHERE id = $1 AND cidadao_id = $2 AND status = 'entregue' FOR UPDATE`,
        [id, sessao.usuarioId],
      );
      if (!r.rowCount) throw new BadRequestException('Só é possível confirmar pedidos que já chegaram ao ponto de coleta.');
      protocolo = r.rows[0].protocolo;
      await registrarRetirada(c, { solicitacaoId: id, protocolo, origem: 'app', pontoId: r.rows[0].ponto_coleta_id, registradoPor: sessao.usuarioId });
      await c.query('COMMIT');
    } catch (erro) {
      await c.query('ROLLBACK').catch(() => undefined);
      throw erro;
    } finally {
      c.release();
    }
    this.eventos.emitir({ tipo: 'solicitacao_atualizada', municipioId: sessao.municipioId, solicitacaoId: id, protocolo });
    return { ok: true, status: STATUS_PARA_CIDADAO.concluida };
  }

  /**
   * Quem pediu encerra o pedido ("Já consegui o que precisava"). Sai do mural e do mapa.
   * Com alguma ajuda (alguém levando ou item recebido): concluído; sem nenhuma: cancelado.
   * Quem estava ajudando é avisado de que não precisa mais levar.
   */
  @Post('solicitacoes/:id/encerrar')
  @HttpCode(200)
  @Perfis('cidadao', 'voluntario')
  async encerrar(@SessaoAtual() sessao: Sessao, @Param('id') id: string) {
    if (!z.string().uuid().safeParse(id).success) throw new NotFoundException('Pedido não encontrado.');
    const s = await this.pool.query<{ protocolo: string; status: string; municipio_id: string; ajudou: boolean }>(
      `SELECT s.protocolo, s.status, s.municipio_id,
              (EXISTS (SELECT 1 FROM oferta o WHERE o.solicitacao_id = s.id AND o.ativa)
               OR EXISTS (SELECT 1 FROM item_solicitacao i WHERE i.solicitacao_id = s.id AND i.obtido_em IS NOT NULL)) AS ajudou
       FROM solicitacao s WHERE s.id = $1 AND s.cidadao_id = $2`,
      [id, sessao.usuarioId],
    );
    const p = s.rows[0];
    if (!p) throw new NotFoundException('Pedido não encontrado.');
    if (!['no_mural', 'em_atendimento', 'entregue'].includes(p.status)) {
      throw new BadRequestException('Este pedido já foi encerrado ou está com a equipe do CRAS.');
    }
    const status = p.ajudou ? 'concluida' : 'cancelada';
    await this.pool.query(
      `UPDATE solicitacao SET status = $2::status_pedido, desfecho = $3::desfecho_pedido, fechado_em = now() WHERE id = $1`,
      [id, status, p.ajudou ? 'resolvida_rede' : 'cancelada'],
    );
    const ofertas = await this.pool.query<{ voluntario_id: string }>('SELECT voluntario_id FROM oferta WHERE solicitacao_id = $1 AND ativa', [id]);
    for (const o of ofertas.rows) {
      await notificar(this.pool, {
        usuarioId: o.voluntario_id,
        solicitacaoId: id,
        tipo: 'pedido_encerrado',
        texto: `Quem pediu encerrou o pedido ${p.protocolo}. Se você ainda não levou a doação, não precisa mais levar. Obrigado por ajudar!`,
      });
    }
    await auditar(this.pool, { usuarioId: sessao.usuarioId, acao: 'encerrar_pedido', entidade: 'solicitacao', entidadeId: id, detalhe: { status } });
    this.eventos.emitir({ tipo: 'solicitacao_atualizada', municipioId: p.municipio_id, solicitacaoId: id, protocolo: p.protocolo });
    return { ok: true, status, status_texto: STATUS_PARA_CIDADAO[status] };
  }

  /**
   * Quem pediu marca o que já recebeu (F7-D4). Quando todos os itens estão marcados,
   * o pedido conclui e cada pessoa que ajudou recebe "Sua ajuda chegou" (P6).
   */
  @Patch('solicitacoes/:id/itens/:itemId')
  @Perfis('cidadao', 'voluntario')
  async marcarItem(@SessaoAtual() sessao: Sessao, @Param('id') id: string, @Param('itemId') itemId: string, @Body() corpo: unknown) {
    const { obtido } = validar(MarcarItem, corpo);
    const uuid = z.string().uuid();
    if (!uuid.safeParse(id).success || !uuid.safeParse(itemId).success) throw new NotFoundException('Item não encontrado.');
    const s = await this.pool.query<{ protocolo: string; status: string; municipio_id: string }>(
      'SELECT protocolo, status, municipio_id FROM solicitacao WHERE id = $1 AND cidadao_id = $2', [id, sessao.usuarioId],
    );
    if (!s.rows[0]) throw new NotFoundException('Pedido não encontrado.');
    if (!['no_mural', 'em_atendimento', 'entregue'].includes(s.rows[0].status)) {
      throw new BadRequestException('Este pedido já foi encerrado.');
    }
    const r = await this.pool.query(
      `UPDATE item_solicitacao SET obtido_em = CASE WHEN $3 THEN coalesce(obtido_em, now()) ELSE NULL END
       WHERE id = $1 AND solicitacao_id = $2`,
      [itemId, id, obtido],
    );
    if (!r.rowCount) throw new NotFoundException('Item não encontrado.');

    const faltam = await this.pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM item_solicitacao WHERE solicitacao_id = $1 AND obtido_em IS NULL', [id],
    );
    let concluido = false;
    if (faltam.rows[0].n === 0) {
      await this.pool.query(
        `UPDATE solicitacao SET status = 'concluida', desfecho = 'resolvida_rede', fechado_em = now() WHERE id = $1`, [id],
      );
      await this.avisarQuemAjudou(id, s.rows[0].protocolo);
      concluido = true;
    }
    await auditar(this.pool, { usuarioId: sessao.usuarioId, acao: 'marcar_item', entidade: 'solicitacao', entidadeId: id, detalhe: { obtido } });
    this.eventos.emitir({ tipo: 'solicitacao_atualizada', municipioId: s.rows[0].municipio_id, solicitacaoId: id, protocolo: s.rows[0].protocolo });
    const { rows } = await this.pool.query(`SELECT s.status, ${sqlItens('$2')} FROM solicitacao s WHERE s.id = $1`, [id, sessao.usuarioId]);
    return { ...rows[0], concluido, status_texto: STATUS_PARA_CIDADAO[rows[0].status] };
  }

  /** Itens ainda sem ninguém levando e sem terem sido recebidos. */
  private async itensAbertos(db: PoolClient, solicitacaoId: string) {
    const { rows } = await db.query<{ id: string }>(
      `SELECT i.id FROM item_solicitacao i
       WHERE i.solicitacao_id = $1 AND i.obtido_em IS NULL
         AND NOT EXISTS (SELECT 1 FROM oferta_item oi JOIN oferta o ON o.id = oi.oferta_id WHERE oi.item_id = i.id AND o.ativa)
       ORDER BY i.ordem`,
      [solicitacaoId],
    );
    return rows;
  }

  private async avisarQuemAjudou(solicitacaoId: string, protocolo: string) {
    const of = await this.pool.query<{ voluntario_id: string }>(
      'SELECT voluntario_id FROM oferta WHERE solicitacao_id = $1 AND ativa', [solicitacaoId],
    );
    for (const o of of.rows) {
      await notificar(this.pool, {
        usuarioId: o.voluntario_id,
        solicitacaoId,
        tipo: 'sua_ajuda_chegou',
        texto: `Sua ajuda chegou! A família recebeu a doação do pedido ${protocolo}. Obrigado por fazer parte do ELO.`,
      });
    }
  }

  /** Notificações do usuário logado (qualquer perfil). */
  @Get('notificacoes')
  async notificacoes(@SessaoAtual() sessao: Sessao) {
    const { rows } = await this.pool.query(
      `SELECT id, solicitacao_id, tipo, texto, lida, criado_em FROM notificacao
       WHERE usuario_id = $1 ORDER BY criado_em DESC LIMIT 50`,
      [sessao.usuarioId],
    );
    return rows;
  }

  @Post('notificacoes/lidas')
  @HttpCode(200)
  async marcarLidas(@SessaoAtual() sessao: Sessao) {
    await this.pool.query('UPDATE notificacao SET lida = true WHERE usuario_id = $1 AND NOT lida', [sessao.usuarioId]);
    return { ok: true };
  }

  /** Bairros do município (para o app escolher o bairro do pedido). */
  @Get('bairros')
  async bairros(@SessaoAtual() sessao: Sessao) {
    const { rows } = await this.pool.query('SELECT id, nome, slug FROM bairro WHERE municipio_id = $1 ORDER BY nome', [sessao.municipioId]);
    return rows;
  }
}
