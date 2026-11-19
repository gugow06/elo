/**
 * Aplica, em ordem, os arquivos .sql de db/migrations que ainda não foram aplicados.
 * Cada migração roda numa transação; a tabela _migracao guarda o que já rodou.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { criarPool } from './conexao';

export async function migrar(url?: string, pastas: string[] = [join(__dirname, 'migrations')]): Promise<string[]> {
  const pool = criarPool(url);
  const aplicadas: string[] = [];
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS _migracao (
      nome text PRIMARY KEY,
      aplicada_em timestamptz NOT NULL DEFAULT now()
    )`);
    const { rows } = await pool.query<{ nome: string }>('SELECT nome FROM _migracao');
    const jaAplicadas = new Set(rows.map((r) => r.nome));

    const arquivos = pastas
      .flatMap((pasta) => readdirSync(pasta).filter((f) => f.endsWith('.sql')).map((f) => ({ pasta, f })))
      .sort((a, b) => a.f.localeCompare(b.f));

    for (const { pasta, f } of arquivos) {
      if (jaAplicadas.has(f)) continue;
      const cliente = await pool.connect();
      try {
        await cliente.query('BEGIN');
        await cliente.query(readFileSync(join(pasta, f), 'utf8'));
        await cliente.query('INSERT INTO _migracao (nome) VALUES ($1)', [f]);
        await cliente.query('COMMIT');
        aplicadas.push(f);
      } catch (erro) {
        await cliente.query('ROLLBACK');
        throw new Error(`Falha na migração ${f}: ${(erro as Error).message}`);
      } finally {
        cliente.release();
      }
    }
    return aplicadas;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  const extras = process.env.MIGRATIONS_EXTRAS?.split(',').filter(Boolean) ?? [];
  migrar(undefined, [join(__dirname, 'migrations'), ...extras])
    .then((aplicadas) => {
      console.log(aplicadas.length ? `Migrações aplicadas: ${aplicadas.join(', ')}` : 'Banco já está atualizado.');
    })
    .catch((erro) => {
      console.error(erro.message);
      process.exit(1);
    });
}
