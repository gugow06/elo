import { Pool, PoolClient } from 'pg';

export async function notificar(
  db: Pool | PoolClient,
  n: { usuarioId: string; solicitacaoId?: string | null; tipo: string; texto: string },
): Promise<void> {
  await db.query('INSERT INTO notificacao (usuario_id, solicitacao_id, tipo, texto) VALUES ($1,$2,$3,$4)', [
    n.usuarioId,
    n.solicitacaoId ?? null,
    n.tipo,
    n.texto,
  ]);
}
