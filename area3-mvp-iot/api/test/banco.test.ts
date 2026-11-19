/**
 * Testes de integração com o banco. Rodam só quando DATABASE_URL está definida
 * (localmente com o Postgres do docker compose e no CI com o serviço postgres).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { migrar } from '../db/migrar';
import { seed } from '../db/seed';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('banco', () => {
  let pool: Pool;

  beforeAll(async () => {
    await migrar(url);
    await seed(url);
    pool = new Pool({ connectionString: url });
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('migrações são idempotentes', async () => {
    expect(await migrar(url)).toEqual([]);
  });

  it('seed cria 2 municípios com bairros, pontos de coleta e todos os perfis', async () => {
    const { rows } = await pool.query(`
      SELECT (SELECT count(*) FROM municipio WHERE codigo_ibge IS NULL)::int AS municipios,
             (SELECT count(*) FROM bairro)::int AS bairros,
             (SELECT count(*) FROM ponto_coleta)::int AS pontos,
             (SELECT count(DISTINCT perfil) FROM usuario)::int AS perfis`);
    expect(rows[0]).toEqual({ municipios: 2, bairros: 6, pontos: 3, perfis: 5 });
  });

  it('protocolo é único por município', async () => {
    const { rows } = await pool.query(`
      SELECT count(*)::int AS n FROM pg_indexes
      WHERE tablename = 'solicitacao' AND indexdef ILIKE '%(municipio_id, protocolo)%'`);
    expect(rows[0].n).toBe(1);
  });
});
