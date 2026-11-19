import { HttpException, HttpStatus } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { auditar } from '../infra/auditoria';
import { notificar } from '../infra/notificacoes';

/**
 * Retirada da doação por quem pediu. Vale para o painel do agente, o sensor do ponto e o app.
 * Marca os itens como recebidos; com todos recebidos, o pedido conclui e quem ajudou recebe
 * "Sua ajuda chegou" (P6).
 */
export const MAX_TENTATIVAS_CODIGO = 5;

/** Confere o código de retirada, com limite de tentativas erradas por pedido (1 hora). */
export async function conferirCodigo(db: Pool | PoolClient, s: { id: string; codigo_retirada: string }, codigo: string, usuarioId: string | null) {
  const erros = (await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM evento_auditoria
     WHERE acao = 'codigo_retirada_errado' AND entidade_id = $1 AND criado_em > now() - interval '1 hour'`,
    [s.id],
  )).rows[0].n;
  if (erros >= MAX_TENTATIVAS_CODIGO) {
    throw new HttpException('Muitas tentativas com código errado. Aguarde 1 hora ou peça ajuda à equipe do CRAS.', HttpStatus.TOO_MANY_REQUESTS);
  }
  if (codigo !== s.codigo_retirada) {
    // Fora da transação do chamador: a tentativa errada precisa ficar registrada
    await auditar(db, { usuarioId, acao: 'codigo_retirada_errado', entidade: 'solicitacao', entidadeId: s.id });
    return false;
  }
  return true;
}

export async function registrarRetirada(
  db: PoolClient,
  r: { solicitacaoId: string; protocolo: string; origem: 'painel' | 'sensor' | 'app'; pontoId?: string | null; registradoPor?: string | null; itens?: string[] },
): Promise<{ itens: string[]; concluido: boolean }> {
  // Sem lista: tudo o que ainda não foi recebido
  const alvo = (await db.query<{ id: string; descricao: string }>(
    `SELECT id, descricao FROM item_solicitacao
     WHERE solicitacao_id = $1 AND obtido_em IS NULL AND ($2::uuid[] IS NULL OR id = ANY($2::uuid[]))
     ORDER BY ordem`,
    [r.solicitacaoId, r.itens ?? null],
  )).rows;
  const retirada = (await db.query<{ id: string }>(
    'INSERT INTO retirada (solicitacao_id, ponto_coleta_id, origem, registrado_por) VALUES ($1, $2, $3, $4) RETURNING id',
    [r.solicitacaoId, r.pontoId ?? null, r.origem, r.registradoPor ?? null],
  )).rows[0].id;
  if (alvo.length) {
    await db.query('INSERT INTO retirada_item (retirada_id, item_id) SELECT $1, unnest($2::uuid[])', [retirada, alvo.map((i) => i.id)]);
    await db.query('UPDATE item_solicitacao SET obtido_em = now() WHERE id = ANY($1::uuid[])', [alvo.map((i) => i.id)]);
  }
  const faltam = (await db.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM item_solicitacao WHERE solicitacao_id = $1 AND obtido_em IS NULL', [r.solicitacaoId],
  )).rows[0].n;
  const concluido = faltam === 0;
  if (concluido) {
    await db.query(
      `UPDATE solicitacao SET status = 'concluida', desfecho = 'resolvida_rede', fechado_em = now()
       WHERE id = $1 AND status IN ('no_mural', 'em_atendimento', 'entregue')`,
      [r.solicitacaoId],
    );
    const ajudantes = (await db.query<{ voluntario_id: string }>('SELECT voluntario_id FROM oferta WHERE solicitacao_id = $1 AND ativa', [r.solicitacaoId])).rows;
    for (const a of ajudantes) {
      await notificar(db, {
        usuarioId: a.voluntario_id,
        solicitacaoId: r.solicitacaoId,
        tipo: 'sua_ajuda_chegou',
        texto: `Sua ajuda chegou! A família recebeu a doação do pedido ${r.protocolo}. Obrigado por fazer parte do ELO.`,
      });
    }
  }
  await auditar(db, { usuarioId: r.registradoPor ?? null, acao: 'registrar_retirada', entidade: 'solicitacao', entidadeId: r.solicitacaoId, detalhe: { origem: r.origem, itens: alvo.length } });
  return { itens: alvo.map((i) => i.descricao), concluido };
}
