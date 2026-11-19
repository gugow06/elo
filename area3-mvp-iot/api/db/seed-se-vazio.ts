import { criarPool } from './conexao';
import { seed } from './seed';

async function principal() {
  const pool = criarPool();
  const { rows } = await pool.query<{ n: string }>('SELECT count(*) AS n FROM municipio');
  await pool.end();
  if (Number(rows[0].n) === 0) {
    await seed();
    console.log('[elo-api] seed de demonstração aplicado (dados fictícios).');
  } else {
    console.log('[elo-api] banco já tem dados; seed ignorado.');
  }
}

principal().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
