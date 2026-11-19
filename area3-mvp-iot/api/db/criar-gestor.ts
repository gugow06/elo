/**
 * Cria o primeiro gestor de um município real (base do IBGE). Os demais operadores entram
 * depois pelo painel. Uso:
 *   pnpm gestor:criar --nome "Secretaria de Assistência Social" --email gestao@prefeitura.gov.br \
 *     --telefone +5571999990000 --ibge 2927408
 */
import { Pool } from 'pg';
import { criarPool } from './conexao';

export interface NovoGestor {
  nome: string;
  email: string;
  telefone: string;
  ibge: number;
}

export async function criarGestor(pool: Pool, g: NovoGestor): Promise<{ id: string; municipio: string; uf: string }> {
  const email = g.email.trim().toLowerCase();
  const tel = g.telefone.replace(/[^\d+]/g, '');
  if (g.nome.trim().length < 3) throw new Error('Informe o nome (--nome).');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('E-mail inválido (--email).');
  if (!/^\+?\d{10,13}$/.test(tel)) throw new Error('Telefone inválido (--telefone, com DDD).');
  const mun = await pool.query<{ id: string; nome: string; uf: string }>('SELECT id, nome, uf FROM municipio WHERE codigo_ibge = $1', [g.ibge]);
  if (!mun.rows[0]) throw new Error(`Município com código IBGE ${g.ibge} não encontrado. Rode pnpm db:ibge antes.`);
  const telefone = tel.startsWith('+') ? tel : `+55${tel}`;
  const dup = await pool.query('SELECT 1 FROM usuario WHERE lower(email) = $1 OR telefone = $2', [email, telefone]);
  if (dup.rowCount) throw new Error('Já existe uma conta com esse e-mail ou telefone.');
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO usuario (municipio_id, perfil, nome, telefone, email) VALUES ($1, 'gestor', $2, $3, $4) RETURNING id`,
    [mun.rows[0].id, g.nome.trim(), telefone, email],
  );
  await pool.query(
    'INSERT INTO evento_auditoria (usuario_id, acao, entidade, entidade_id, detalhe) VALUES (NULL, $1, $2, $3, $4)',
    ['criar_gestor', 'usuario', rows[0].id, JSON.stringify({ via: 'linha de comando', ibge: g.ibge })],
  );
  return { id: rows[0].id, municipio: mun.rows[0].nome, uf: mun.rows[0].uf };
}

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (require.main === module) {
  const pool = criarPool();
  criarGestor(pool, {
    nome: argumento('nome') ?? '',
    email: argumento('email') ?? '',
    telefone: argumento('telefone') ?? '',
    ibge: Number(argumento('ibge')),
  })
    .then((r) => console.log(`[gestor] criado em ${r.municipio} - ${r.uf} (id ${r.id}). Ele entra no painel com o telefone informado.`))
    .catch((erro) => { console.error(`[gestor] ${(erro as Error).message}`); process.exitCode = 1; })
    .finally(() => pool.end());
}
