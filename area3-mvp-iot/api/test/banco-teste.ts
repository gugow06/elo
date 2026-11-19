/**
 * Os testes apagam e recriam os dados (seed com TRUNCATE). Para nunca apagar as contas de quem está
 * testando o app, eles rodam num banco separado: o mesmo servidor do DATABASE_URL, com o nome + "_teste"
 * (ou DATABASE_URL_TESTE, se definida).
 */
import { Client } from 'pg';

export function urlDeTeste(url = process.env.DATABASE_URL): string | undefined {
  if (process.env.DATABASE_URL_TESTE) return process.env.DATABASE_URL_TESTE;
  if (!url) return undefined;
  const u = new URL(url);
  const nome = u.pathname.replace(/^\//, '') || 'postgres';
  if (!nome.endsWith('_teste')) u.pathname = `/${nome}_teste`;
  return u.toString();
}

/** globalSetup do vitest: cria o banco de teste se ainda não existir. */
export default async function criarBancoDeTeste() {
  const original = process.env.DATABASE_URL;
  const teste = urlDeTeste(original);
  if (!original || !teste) return; // sem banco: os testes de integração se desligam sozinhos
  const nome = new URL(teste).pathname.slice(1);
  const c = new Client({ connectionString: original });
  await c.connect();
  try {
    const existe = await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [nome]);
    if (!existe.rowCount) await c.query(`CREATE DATABASE "${nome.replace(/"/g, '""')}"`);
  } finally {
    await c.end();
  }
}
