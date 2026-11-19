import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Pool } from 'pg';
import { z } from 'zod';
import { AuthGuard, Perfis, SessaoAtual } from '../auth/auth.guard';
import { Sessao } from '../auth/sessao';
import { POOL } from '../infra/banco.module';
import { validar } from '../infra/validacao';
import { sqlUrlFoto } from '../perfil/fotos';

const Uuid = z.string().uuid();
const NovaMensagem = z.object({ texto: z.string().trim().min(1, 'Escreva a mensagem').max(1000, 'A mensagem pode ter até 1.000 caracteres') });
const Abrir = z.object({ solicitacao_id: z.string().uuid('Pedido inválido') });
const ListaMensagens = z.object({ depois: z.iso.datetime({ offset: true }).optional() });

/** Mensagens por minuto, por pessoa (evita mensagem em massa). */
const LIMITE_POR_MINUTO = 20;

/**
 * Conversa entre cidadãos: quem pediu e cada pessoa que se ofereceu para ajudar no pedido.
 * A conversa abre sozinha quando alguém se oferece (POST /mural/:id/ofertas). Ninguém manda
 * mensagem a um desconhecido, e cada lado vê só o primeiro nome e a foto do outro.
 */
@Controller('conversas')
@UseGuards(AuthGuard)
@Perfis('cidadao', 'voluntario')
export class ConversasController {
  constructor(@Inject(POOL) private readonly pool: Pool) {}

  /** Minhas conversas, a mais recente primeiro. Com `solicitacao_id`, só as daquele pedido. */
  @Get()
  async listar(@SessaoAtual() sessao: Sessao, @Query('solicitacao_id') pedido?: string) {
    if (pedido !== undefined && !Uuid.safeParse(pedido).success) throw new NotFoundException('Pedido não encontrado.');
    const { rows } = await this.pool.query(
      `SELECT c.id, c.solicitacao_id, s.titulo AS pedido_titulo, s.protocolo,
              CASE WHEN c.cidadao_id = $1 THEN 'pediu' ELSE 'ajuda' END AS meu_papel,
              split_part(o.nome, ' ', 1) AS outra_pessoa, ${sqlUrlFoto('f.id')} AS outra_foto,
              um.texto AS ultima_mensagem, um.criada_em AS ultima_em, (um.autor_id = $1) AS ultima_minha,
              (SELECT count(*)::int FROM mensagem m WHERE m.conversa_id = c.id AND m.autor_id <> $1 AND m.lida_em IS NULL) AS nao_lidas
       FROM conversa c
       JOIN solicitacao s ON s.id = c.solicitacao_id
       JOIN usuario o ON o.id = CASE WHEN c.cidadao_id = $1 THEN c.voluntario_id ELSE c.cidadao_id END
       LEFT JOIN foto_usuario f ON f.usuario_id = o.id
       LEFT JOIN LATERAL (SELECT texto, criada_em, autor_id FROM mensagem m WHERE m.conversa_id = c.id ORDER BY criada_em DESC LIMIT 1) um ON true
       WHERE (c.cidadao_id = $1 OR c.voluntario_id = $1) AND ($2::uuid IS NULL OR c.solicitacao_id = $2)
       ORDER BY coalesce(um.criada_em, c.criada_em) DESC
       LIMIT 100`,
      [sessao.usuarioId, pedido ?? null],
    );
    return rows;
  }

  /** Mensagens não lidas (conversas) e notificações do sistema não lidas: o número na aba Mensagens. */
  @Get('nao-lidas')
  async naoLidas(@SessaoAtual() sessao: Sessao) {
    const { rows } = await this.pool.query<{ mensagens: number; notificacoes: number }>(
      `SELECT (SELECT count(*)::int FROM mensagem m JOIN conversa c ON c.id = m.conversa_id
               WHERE (c.cidadao_id = $1 OR c.voluntario_id = $1) AND m.autor_id <> $1 AND m.lida_em IS NULL) AS mensagens,
              (SELECT count(*)::int FROM notificacao WHERE usuario_id = $1 AND NOT lida) AS notificacoes`,
      [sessao.usuarioId],
    );
    return rows[0];
  }

  /** Quem ajuda abre a conversa com quem pediu (a conversa já existe desde a oferta). */
  @Post()
  @HttpCode(200)
  async abrir(@SessaoAtual() sessao: Sessao, @Body() corpo: unknown) {
    const { solicitacao_id } = validar(Abrir, corpo);
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO conversa (solicitacao_id, cidadao_id, voluntario_id)
       SELECT s.id, s.cidadao_id, $2 FROM solicitacao s
       WHERE s.id = $1 AND s.cidadao_id <> $2
         AND EXISTS (SELECT 1 FROM oferta o WHERE o.solicitacao_id = s.id AND o.voluntario_id = $2)
       ON CONFLICT (solicitacao_id, voluntario_id) DO UPDATE SET solicitacao_id = EXCLUDED.solicitacao_id
       RETURNING id`,
      [solicitacao_id, sessao.usuarioId],
    );
    if (!rows[0]) throw new NotFoundException('Você só conversa com quem pediu depois de se oferecer para ajudar.');
    return { id: rows[0].id };
  }

  /** Mensagens da conversa (as mais antigas primeiro). Marca como lidas as que a outra pessoa mandou. */
  @Get(':id/mensagens')
  async mensagens(@SessaoAtual() sessao: Sessao, @Param('id') id: string, @Query() query: unknown) {
    await this.daConversa(sessao, id);
    const { depois } = validar(ListaMensagens, query ?? {});
    await this.pool.query('UPDATE mensagem SET lida_em = now() WHERE conversa_id = $1 AND autor_id <> $2 AND lida_em IS NULL', [id, sessao.usuarioId]);
    const { rows } = await this.pool.query(
      `SELECT id, texto, criada_em, (autor_id = $2) AS minha, lida_em IS NOT NULL AS lida
       FROM mensagem WHERE conversa_id = $1 AND ($3::timestamptz IS NULL OR criada_em > $3)
       ORDER BY criada_em LIMIT 500`,
      [id, sessao.usuarioId, depois ?? null],
    );
    return rows;
  }

  @Post(':id/mensagens')
  async enviar(@SessaoAtual() sessao: Sessao, @Param('id') id: string, @Body() corpo: unknown) {
    await this.daConversa(sessao, id);
    const { texto } = validar(NovaMensagem, corpo);
    const recentes = await this.pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM mensagem WHERE autor_id = $1 AND criada_em > now() - interval '1 minute'",
      [sessao.usuarioId],
    );
    if (recentes.rows[0].n >= LIMITE_POR_MINUTO) {
      throw new HttpException('Muitas mensagens em pouco tempo. Espere um minuto.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const { rows } = await this.pool.query(
      `INSERT INTO mensagem (conversa_id, autor_id, texto) VALUES ($1, $2, $3)
       RETURNING id, texto, criada_em, true AS minha, false AS lida`,
      [id, sessao.usuarioId, texto],
    );
    return rows[0];
  }

  /** A conversa existe e esta pessoa participa dela; senão, 404 (não revela conversas de outros). */
  private async daConversa(sessao: Sessao, id: string): Promise<void> {
    if (!Uuid.safeParse(id).success) throw new NotFoundException('Conversa não encontrada.');
    const r = await this.pool.query('SELECT 1 FROM conversa WHERE id = $1 AND (cidadao_id = $2 OR voluntario_id = $2)', [id, sessao.usuarioId]);
    if (!r.rowCount) throw new NotFoundException('Conversa não encontrada.');
  }
}
