import { Pool, PoolClient } from 'pg';

/**
 * Trilha de auditoria append-only (MD-03). Registra também LEITURA de dado sensível,
 * como o relato original de uma solicitação.
 */
export async function auditar(
  db: Pool | PoolClient,
  evento: { usuarioId?: string | null; acao: string; entidade: string; entidadeId?: string | null; detalhe?: unknown },
): Promise<void> {
  await db.query(
    'INSERT INTO evento_auditoria (usuario_id, acao, entidade, entidade_id, detalhe) VALUES ($1,$2,$3,$4,$5)',
    [evento.usuarioId ?? null, evento.acao, evento.entidade, evento.entidadeId ?? null, evento.detalhe ? JSON.stringify(evento.detalhe) : null],
  );
}
