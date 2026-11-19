import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import { emailCodigo, enviarEmail } from '../infra/email';
import { sha256 } from '../infra/hash';

const log = new Logger('Codigos');
const MAX_CODIGOS_ATIVOS = 5;

/** Com MODO_DEMO o código também volta na resposta (testes e demonstração). */
export const modoDemo = () => process.env.MODO_DEMO !== 'false';

/**
 * Gera um código de 6 dígitos (vale 10 minutos) e envia por e-mail (Resend) ou, no painel,
 * por SMS simulado (log). Guarda só o hash. Limita os códigos ativos por conta.
 */
export async function gerarCodigo(
  db: Pool | PoolClient,
  usuarioId: string,
  destino: { email: string } | { telefone: string },
): Promise<{ codigo_demo?: string }> {
  const ativos = await db.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM codigo_acesso WHERE usuario_id = $1 AND usado_em IS NULL AND expira_em > now()',
    [usuarioId],
  );
  if (ativos.rows[0].n >= MAX_CODIGOS_ATIVOS) {
    throw new HttpException('Muitos códigos pedidos. Use o último que chegou ou aguarde 10 minutos.', HttpStatus.TOO_MANY_REQUESTS);
  }
  const cod = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await db.query(
    `INSERT INTO codigo_acesso (usuario_id, codigo_hash, expira_em) VALUES ($1, $2, now() + interval '10 minutes')`,
    [usuarioId, sha256(`${usuarioId}:${cod}`)],
  );
  if ('email' in destino) {
    const m = emailCodigo(cod);
    await enviarEmail(destino.email, m.assunto, m.texto, m.html);
  } else {
    log.log(`[SMS simulado] código para ${destino.telefone}: ${cod}`);
  }
  return modoDemo() ? { codigo_demo: cod } : {};
}

/** Marca o código como usado. Devolve false se não existir, já tiver sido usado ou tiver expirado. */
export async function consumirCodigo(db: Pool | PoolClient, usuarioId: string, codigo: string): Promise<boolean> {
  const r = await db.query(
    `UPDATE codigo_acesso SET usado_em = now()
     WHERE id = (SELECT id FROM codigo_acesso
                 WHERE usuario_id = $1 AND codigo_hash = $2 AND usado_em IS NULL AND expira_em > now()
                 ORDER BY expira_em DESC LIMIT 1)
     RETURNING id`,
    [usuarioId, sha256(`${usuarioId}:${codigo}`)],
  );
  return (r.rowCount ?? 0) > 0;
}

/** "ana.ribeiro@example.com" → "a***o@example.com" (para dizer onde o código foi enviado). */
export function mascararEmail(email: string): string {
  const [nome, dominio] = email.split('@');
  return `${nome[0]}***${nome.length > 1 ? nome[nome.length - 1] : ''}@${dominio}`;
}
