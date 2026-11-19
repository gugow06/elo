import { BadRequestException, ConflictException, Controller, Get, HttpCode, Inject, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Pool } from 'pg';
import { z } from 'zod';
import { AuthGuard, Perfis, SessaoAtual } from '../auth/auth.guard';
import { Sessao } from '../auth/sessao';
import { auditar } from '../infra/auditoria';
import { POOL } from '../infra/banco.module';
import { EventosService } from '../infra/eventos.service';
import { notificar } from '../infra/notificacoes';
import { STATUS_PARA_CIDADAO } from '../solicitacoes/textos';
import { validar } from '../infra/validacao';

const FiltroMural = z.object({
  bairro: z.string().max(80).optional(),
  uf: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'UF inválida').optional(),
  municipio: z.string().uuid('Cidade inválida').optional(),
  categoria: z.enum(['alimento', 'roupa', 'movel', 'material_escolar', 'apoio_idoso', 'transporte', 'outro']).optional(),
  // "Prioridade" = quem espera há mais tempo (F7-D11): a faixa de risco nunca é mostrada no app
  ordem: z.enum(['bairro', 'recentes', 'aguardando']).default('bairro'),
  pagina: z.coerce.number().int().min(0).max(1000).default(0),
  limite: z.coerce.number().int().min(1).max(50).default(30),
});

const ORDENS = {
  bairro: '(s.bairro_id = $3::uuid) DESC, s.criado_em',
  recentes: 's.criado_em DESC',
  aguardando: 's.criado_em ASC',
} as const;

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
   * Com `uf` ou `municipio`: pedidos de qualquer lugar do Brasil, para ajudar de longe.
   * Nunca expõe endereço, nome, relato ou faixa de risco.
   */
  @Get('mural')
  @Perfis('voluntario', 'cidadao')
  async mural(@SessaoAtual() sessao: Sessao, @Query() query: unknown) {
    const f = validar(FiltroMural, query);
    const municipio = f.municipio ?? (f.uf ? null : sessao.municipioId);
    const { rows } = await this.pool.query(
      `SELECT s.id, s.titulo, s.categoria, s.criado_em,
              b.nome AS bairro, b.slug AS bairro_slug, m.nome AS municipio, m.uf,
              p.nome AS ponto_coleta, p.endereco AS ponto_coleta_endereco,
              round(extract(epoch FROM now() - s.criado_em) / 3600, 1) AS horas_no_mural
       FROM solicitacao s
       JOIN bairro b ON b.id = s.bairro_id
       JOIN municipio m ON m.id = s.municipio_id
       LEFT JOIN ponto_coleta p ON p.id = s.ponto_coleta_id
       WHERE s.status = 'no_mural' AND s.faixa = 'verde'
         AND ($1::uuid IS NULL OR s.municipio_id = $1)
         AND ($5::text IS NULL OR m.uf = $5)
         AND ($2::text IS NULL OR b.slug = $2)
         AND ($6::categoria_pedido IS NULL OR s.categoria = $6)
         AND s.cidadao_id <> $4 AND ($3::uuid IS NULL OR true)
       ORDER BY ${ORDENS[f.ordem]}
       LIMIT $7 OFFSET $8`,
      [municipio, f.bairro ?? null, sessao.bairroId, sessao.usuarioId, f.uf ?? null, f.categoria ?? null, f.limite, f.pagina * f.limite],
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
       LEFT JOIN solicitacao s ON s.bairro_id = b.id AND s.status = 'no_mural' AND s.faixa = 'verde'
       WHERE b.municipio_id = $1
       GROUP BY b.nome, b.slug ORDER BY pedidos DESC, b.nome`,
      [sessao.municipioId],
    );
    return rows;
  }

  /** Qualquer usuário do app assume o pedido (RF-403), menos o próprio. Verde: pareamento automático (RF-404). */
  @Post('mural/:id/ofertas')
  @Perfis('voluntario', 'cidadao')
  async oferecer(@SessaoAtual() sessao: Sessao, @Param('id') id: string) {
    const cliente = await this.pool.connect();
    try {
      await cliente.query('BEGIN');
      const { rows } = await cliente.query<{ id: string; protocolo: string; cidadao_id: string; municipio_id: string; titulo: string; ponto: string | null; endereco: string | null }>(
        `SELECT s.id, s.protocolo, s.cidadao_id, s.municipio_id, s.titulo, p.nome AS ponto, p.endereco
         FROM solicitacao s LEFT JOIN ponto_coleta p ON p.id = s.ponto_coleta_id
         WHERE s.id = $1 AND s.status = 'no_mural' AND s.faixa = 'verde'
         FOR UPDATE OF s`,
        [id],
      );
      const s = rows[0];
      if (!s) throw new NotFoundException('Este pedido não está mais disponível no mural.');
      if (s.cidadao_id === sessao.usuarioId) throw new BadRequestException('Este pedido é seu. Outra pessoa do bairro vai ajudar.');

      try {
        await cliente.query('INSERT INTO oferta (solicitacao_id, voluntario_id) VALUES ($1, $2)', [id, sessao.usuarioId]);
      } catch {
        throw new ConflictException('Outro voluntário já assumiu este pedido.');
      }
      await cliente.query(
        `UPDATE solicitacao SET status = 'em_atendimento', primeira_resposta_em = coalesce(primeira_resposta_em, now()) WHERE id = $1`,
        [id],
      );
      await notificar(cliente, {
        usuarioId: s.cidadao_id,
        solicitacaoId: id,
        tipo: 'voluntario_assumiu',
        texto: `Um voluntário do seu bairro vai ajudar com o pedido ${s.protocolo}. A doação será entregue no ${s.ponto ?? 'ponto de coleta'}.`,
      });
      await auditar(cliente, { usuarioId: sessao.usuarioId, acao: 'oferecer_ajuda', entidade: 'solicitacao', entidadeId: id });
      await cliente.query('COMMIT');
      this.eventos.emitir({ tipo: 'solicitacao_atualizada', municipioId: s.municipio_id, solicitacaoId: id, protocolo: s.protocolo });

      return {
        protocolo: s.protocolo,
        titulo: s.titulo,
        ponto_coleta: { nome: s.ponto, endereco: s.endereco },
        instrucoes: `Leve a doação ao ${s.ponto}. Lá, digite o protocolo ${s.protocolo} no teclado do ponto e coloque a doação na balança.`,
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
              b.nome AS bairro, p.nome AS ponto_coleta, p.endereco AS ponto_coleta_endereco,
              e.criado_em AS entregue_em, e.origem AS entrega_origem
       FROM oferta o
       JOIN solicitacao s ON s.id = o.solicitacao_id
       JOIN bairro b ON b.id = s.bairro_id
       LEFT JOIN ponto_coleta p ON p.id = s.ponto_coleta_id
       LEFT JOIN LATERAL (SELECT criado_em, origem FROM entrega WHERE solicitacao_id = s.id ORDER BY criado_em DESC LIMIT 1) e ON true
       WHERE o.voluntario_id = $1 AND o.ativa
       ORDER BY o.criado_em DESC`,
      [sessao.usuarioId],
    );
    return rows.map((r) => ({
      ...r,
      desfecho_texto:
        r.status === 'concluida'
          ? 'Sua ajuda chegou! A família já retirou a doação. Obrigado.'
          : r.status === 'entregue'
            ? 'Sua ajuda chegou ao ponto de coleta. A família foi avisada para retirar.'
            : 'Aguardando você levar a doação ao ponto de coleta.',
    }));
  }

  /** Cidadão confirma que retirou a doação (RF-407). Fecha o pedido e avisa o voluntário. */
  @Post('solicitacoes/:id/confirmar-recebimento')
  @HttpCode(200)
  @Perfis('cidadao', 'voluntario')
  async confirmarRecebimento(@SessaoAtual() sessao: Sessao, @Param('id') id: string) {
    const r = await this.pool.query<{ protocolo: string }>(
      `UPDATE solicitacao SET status = 'concluida', desfecho = 'resolvida_rede', fechado_em = now()
       WHERE id = $1 AND cidadao_id = $2 AND status = 'entregue' RETURNING protocolo`,
      [id, sessao.usuarioId],
    );
    if (!r.rowCount) throw new BadRequestException('Só é possível confirmar pedidos que já chegaram ao ponto de coleta.');
    const of = await this.pool.query<{ voluntario_id: string }>('SELECT voluntario_id FROM oferta WHERE solicitacao_id = $1 AND ativa', [id]);
    if (of.rows[0]) {
      await notificar(this.pool, {
        usuarioId: of.rows[0].voluntario_id,
        solicitacaoId: id,
        tipo: 'sua_ajuda_chegou',
        texto: `Sua ajuda chegou! A família retirou a doação do pedido ${r.rows[0].protocolo}. Obrigado por fazer parte do ELO.`,
      });
    }
    this.eventos.emitir({ tipo: 'solicitacao_atualizada', municipioId: sessao.municipioId, solicitacaoId: id, protocolo: r.rows[0].protocolo });
    return { ok: true, status: STATUS_PARA_CIDADAO.concluida };
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
