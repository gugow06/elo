import { Pool } from 'pg';
import { auditar } from '../infra/auditoria';

type Aviso = { usuarioId: string; solicitacaoId: string; tipo: string; texto: string };

/**
 * Exclusão de conta (LGPD, art. 18, VI). Numa transação só:
 * - pedidos ainda no mural são encerrados (quem ia levar é avisado) e o relato é apagado;
 *   pedidos que estão com a equipe do CRAS continuam com a equipe, sem o nome da pessoa;
 * - as ajudas que a pessoa ia levar são canceladas e os itens voltam para o mural
 *   (o que já chegou ao ponto de coleta continua valendo);
 * - conversas, mensagens, foto, notificações, códigos e vínculo com o Google são apagados;
 * - nome, e-mail, telefone, CPF e data de nascimento são apagados. A linha da conta fica anônima
 *   ("Conta excluída") porque pedidos, entregas e auditoria continuam no histórico do serviço público.
 * Devolve os avisos para as outras pessoas, enviados depois da transação.
 */
export async function excluirConta(pool: Pool, usuarioId: string) {
  const c = await pool.connect();
  const avisos: Aviso[] = [];
  try {
    await c.query('BEGIN');
    const u = await c.query('SELECT 1 FROM usuario WHERE id = $1 AND excluido_em IS NULL FOR UPDATE', [usuarioId]);
    if (!u.rowCount) throw new Error('Conta não encontrada.');

    // 1. Pedidos da pessoa ainda no mural: encerrados
    const pedidos = await c.query<{ id: string; protocolo: string }>(
      `UPDATE solicitacao SET status = 'cancelada', desfecho = 'cancelada', fechado_em = now()
       WHERE cidadao_id = $1 AND status IN ('recebida', 'no_mural', 'em_atendimento', 'entregue')
       RETURNING id, protocolo`,
      [usuarioId],
    );
    for (const p of pedidos.rows) {
      const quem = await c.query<{ voluntario_id: string }>('SELECT voluntario_id FROM oferta WHERE solicitacao_id = $1 AND ativa', [p.id]);
      for (const q of quem.rows) {
        avisos.push({
          usuarioId: q.voluntario_id,
          solicitacaoId: p.id,
          tipo: 'pedido_encerrado',
          texto: `O pedido ${p.protocolo} foi encerrado porque quem pediu saiu do ELO. Se você ainda não levou a doação, não precisa mais levar. Obrigado por ajudar!`,
        });
      }
      await c.query('UPDATE oferta SET ativa = false WHERE solicitacao_id = $1 AND ativa', [p.id]);
    }
    // Relato (dado sensível) dos pedidos que não estão com a equipe do CRAS
    await c.query(
      `DELETE FROM relato r USING solicitacao s
       WHERE r.solicitacao_id = s.id AND s.cidadao_id = $1 AND s.status <> 'na_fila_tecnica'`,
      [usuarioId],
    );

    // 2. Ajudas que a pessoa ia levar: canceladas; itens que ainda não chegaram voltam para o mural
    const ofertas = await c.query<{ id: string; solicitacao_id: string; cidadao_id: string; protocolo: string }>(
      `SELECT o.id, o.solicitacao_id, s.cidadao_id, s.protocolo
       FROM oferta o JOIN solicitacao s ON s.id = o.solicitacao_id
       WHERE o.voluntario_id = $1 AND o.ativa`,
      [usuarioId],
    );
    for (const o of ofertas.rows) {
      const liberados = await c.query<{ descricao: string }>(
        `DELETE FROM oferta_item oi USING item_solicitacao i
         WHERE oi.oferta_id = $1 AND i.id = oi.item_id AND i.entregue_em IS NULL AND i.obtido_em IS NULL
         RETURNING i.descricao`,
        [o.id],
      );
      await c.query('UPDATE oferta SET ativa = false WHERE id = $1', [o.id]);
      if (liberados.rowCount) {
        await c.query(
          `UPDATE solicitacao SET status = 'no_mural' WHERE id = $1 AND status = 'em_atendimento'`,
          [o.solicitacao_id],
        );
        avisos.push({
          usuarioId: o.cidadao_id,
          solicitacaoId: o.solicitacao_id,
          tipo: 'ajuda_cancelada',
          texto: `Uma pessoa que ia levar ${liberados.rows.map((r) => r.descricao).join(', ')} para o pedido ${o.protocolo} saiu do ELO. Esses itens voltaram para o mural.`,
        });
      }
    }

    // 3. Conversas, mensagens e o resto dos dados pessoais
    await c.query('DELETE FROM conversa WHERE cidadao_id = $1 OR voluntario_id = $1', [usuarioId]);
    await c.query('DELETE FROM mensagem WHERE autor_id = $1', [usuarioId]);
    await c.query('DELETE FROM foto_usuario WHERE usuario_id = $1', [usuarioId]);
    await c.query('DELETE FROM conta_social WHERE usuario_id = $1', [usuarioId]);
    await c.query('DELETE FROM notificacao WHERE usuario_id = $1', [usuarioId]);
    await c.query('DELETE FROM codigo_acesso WHERE usuario_id = $1', [usuarioId]);
    await c.query(
      `UPDATE usuario SET nome = 'Conta excluída', email = NULL, telefone = '', cpf = NULL, data_nascimento = NULL,
                          email_confirmado_em = NULL, dois_fatores_em = NULL, excluido_em = now()
       WHERE id = $1`,
      [usuarioId],
    );
    await auditar(c, {
      usuarioId,
      acao: 'excluir_conta',
      entidade: 'usuario',
      entidadeId: usuarioId,
      detalhe: { pedidos_encerrados: pedidos.rowCount, ajudas_canceladas: ofertas.rowCount },
    });
    await c.query('COMMIT');
    return { avisos, pedidosEncerrados: pedidos.rowCount ?? 0, ajudasCanceladas: ofertas.rowCount ?? 0 };
  } catch (erro) {
    await c.query('ROLLBACK');
    throw erro;
  } finally {
    c.release();
  }
}
