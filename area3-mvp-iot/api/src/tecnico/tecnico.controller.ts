import { Body, Controller, Get, Inject, MessageEvent, NotFoundException, Param, Post, Sse, UseGuards } from '@nestjs/common';
import { Pool } from 'pg';
import { map, merge, Observable, interval } from 'rxjs';
import { z } from 'zod';
import { AuthGuard, Perfis, SessaoAtual } from '../auth/auth.guard';
import { Sessao } from '../auth/sessao';
import { auditar } from '../infra/auditoria';
import { POOL } from '../infra/banco.module';
import { EventosService } from '../infra/eventos.service';
import { validar } from '../infra/validacao';
import { SolicitacoesService } from '../solicitacoes/solicitacoes.service';
import { TITULO_POR_CATEGORIA } from '../solicitacoes/textos';

const Reclassificar = z.object({
  faixa: z.enum(['verde', 'amarela', 'vermelha']),
  categoria: z.enum(['alimento', 'roupa', 'movel', 'material_escolar', 'apoio_idoso', 'transporte', 'outro']),
  justificativa: z.string().trim().min(10, 'Justifique a reclassificação (mínimo 10 caracteres)').max(500),
});

const Concluir = z.object({
  desfecho: z.enum(['resolvida_cras', 'encaminhada', 'nao_atendida', 'cancelada']),
  observacao: z.string().max(500).optional(),
});

/** Painel do técnico do CRAS: fila priorizada por risco (RF-501), alerta (RF-502), reclassificação (RF-507). */
@Controller('tecnico')
@UseGuards(AuthGuard)
@Perfis('tecnico')
export class TecnicoController {
  constructor(
    @Inject(POOL) private readonly pool: Pool,
    @Inject(SolicitacoesService) private readonly solicitacoes: SolicitacoesService,
    @Inject(EventosService) private readonly eventos: EventosService,
  ) {}

  @Get('fila')
  async fila(@SessaoAtual() sessao: Sessao) {
    const { rows } = await this.pool.query(
      `SELECT s.id, s.protocolo, s.faixa, s.categoria, s.status, s.titulo, s.canal, s.escalado, s.criado_em,
              b.nome AS bairro, u.nome AS cidadao,
              round(extract(epoch FROM now() - s.criado_em) / 3600, 1) AS horas_espera,
              c.origem AS classificacao_origem, c.regra AS classificacao_regra, c.justificativa AS classificacao_justificativa
       FROM solicitacao s
       JOIN bairro b ON b.id = s.bairro_id
       JOIN usuario u ON u.id = s.cidadao_id
       LEFT JOIN LATERAL (SELECT origem, regra, justificativa FROM classificacao
                          WHERE solicitacao_id = s.id ORDER BY criado_em DESC LIMIT 1) c ON true
       WHERE s.municipio_id = $1 AND s.status = 'na_fila_tecnica'
       ORDER BY CASE s.faixa WHEN 'vermelha' THEN 0 WHEN 'amarela' THEN 1 ELSE 2 END, s.criado_em`,
      [sessao.municipioId],
    );
    return rows;
  }

  /** Ficha com o relato original: leitura de dado sensível, sempre auditada (RNF-S05). */
  @Get('solicitacoes/:id')
  async ficha(@SessaoAtual() sessao: Sessao, @Param('id') id: string) {
    const { rows } = await this.pool.query(
      `SELECT s.*, r.texto AS relato, b.nome AS bairro, u.nome AS cidadao, u.telefone
       FROM solicitacao s JOIN relato r ON r.solicitacao_id = s.id
       JOIN bairro b ON b.id = s.bairro_id JOIN usuario u ON u.id = s.cidadao_id
       WHERE s.id = $1 AND s.municipio_id = $2`,
      [id, sessao.municipioId],
    );
    if (!rows[0]) throw new NotFoundException('Solicitação não encontrada.');
    const historico = await this.pool.query(
      `SELECT faixa, categoria, confianca, origem, regra, justificativa, criado_em
       FROM classificacao WHERE solicitacao_id = $1 ORDER BY criado_em`,
      [id],
    );
    await auditar(this.pool, { usuarioId: sessao.usuarioId, acao: 'ler_relato', entidade: 'solicitacao', entidadeId: id });
    return { ...rows[0], classificacoes: historico.rows };
  }

  /** RF-304 / MD-02: cria nova classificação (não sobrescreve) com justificativa obrigatória. */
  @Post('solicitacoes/:id/reclassificar')
  async reclassificar(@SessaoAtual() sessao: Sessao, @Param('id') id: string, @Body() corpo: unknown) {
    const d = validar(Reclassificar, corpo);
    const status = d.faixa === 'verde' ? 'no_mural' : 'na_fila_tecnica';
    const r = await this.pool.query(
      `UPDATE solicitacao SET faixa = $3, categoria = $4, status = $5, titulo = $6,
              primeira_resposta_em = coalesce(primeira_resposta_em, now())
       WHERE id = $1 AND municipio_id = $2 RETURNING protocolo`,
      [id, sessao.municipioId, d.faixa, d.categoria, status, TITULO_POR_CATEGORIA[d.categoria]],
    );
    if (!r.rowCount) throw new NotFoundException('Solicitação não encontrada.');
    await this.solicitacoes.registrarClassificacao(
      this.pool,
      id,
      { faixa: d.faixa, categoria: d.categoria, confianca: 1, origem: 'tecnico' as never, justificativa: d.justificativa, duracaoMs: 0, chamouLlm: false },
      sessao.usuarioId,
    );
    await auditar(this.pool, { usuarioId: sessao.usuarioId, acao: 'reclassificar', entidade: 'solicitacao', entidadeId: id, detalhe: d });
    this.eventos.emitir({ tipo: 'solicitacao_atualizada', municipioId: sessao.municipioId, solicitacaoId: id, protocolo: r.rows[0].protocolo });
    return { ok: true, status };
  }

  @Post('solicitacoes/:id/concluir')
  async concluir(@SessaoAtual() sessao: Sessao, @Param('id') id: string, @Body() corpo: unknown) {
    const d = validar(Concluir, corpo);
    const r = await this.pool.query(
      `UPDATE solicitacao SET status = 'concluida', desfecho = $3, fechado_em = now(),
              primeira_resposta_em = coalesce(primeira_resposta_em, now())
       WHERE id = $1 AND municipio_id = $2 RETURNING protocolo`,
      [id, sessao.municipioId, d.desfecho],
    );
    if (!r.rowCount) throw new NotFoundException('Solicitação não encontrada.');
    await auditar(this.pool, { usuarioId: sessao.usuarioId, acao: 'concluir', entidade: 'solicitacao', entidadeId: id, detalhe: d });
    this.eventos.emitir({ tipo: 'solicitacao_atualizada', municipioId: sessao.municipioId, solicitacaoId: id, protocolo: r.rows[0].protocolo });
    return { ok: true };
  }

  @Get('notificacoes')
  async notificacoes(@SessaoAtual() sessao: Sessao) {
    const { rows } = await this.pool.query(
      `SELECT id, solicitacao_id, tipo, texto, lida, criado_em FROM notificacao
       WHERE usuario_id = $1 ORDER BY criado_em DESC LIMIT 50`,
      [sessao.usuarioId],
    );
    return rows;
  }

  /** Eventos em tempo real (alerta vermelho, novos pedidos) via Server-Sent Events. */
  @Sse('eventos')
  @Perfis('tecnico', 'gestor')
  eventosAoVivo(@SessaoAtual() sessao: Sessao): Observable<MessageEvent> {
    const batida = interval(25000).pipe(map(() => ({ type: 'ping', data: {} }) as MessageEvent));
    const eventos = this.eventos.doMunicipio(sessao.municipioId).pipe(map((e) => ({ type: e.tipo, data: e }) as MessageEvent));
    return merge(eventos, batida);
  }
}
