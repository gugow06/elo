/**
 * Importa UFs e municípios do IBGE (db/dados) para o banco. Idempotente: atualiza pelo código do IBGE.
 * Uso: pnpm db:ibge   (também roda ao subir a API e ao fim do seed)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';
import { criarPool } from './conexao';

/** CSV simples com aspas (os nomes de município não têm quebra de linha). */
function lerCsv(arquivo: string): Record<string, string>[] {
  const linhas = readFileSync(join(__dirname, 'dados', arquivo), 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/);
  const campos = (l: string) => {
    const out: string[] = [];
    let atual = '';
    let aspas = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (c === '"') {
        if (aspas && l[i + 1] === '"') { atual += '"'; i++; } else aspas = !aspas;
      } else if (c === ',' && !aspas) { out.push(atual); atual = ''; } else atual += c;
    }
    out.push(atual);
    return out;
  };
  const cab = campos(linhas[0]);
  return linhas.slice(1).map((l) => Object.fromEntries(campos(l).map((v, i) => [cab[i], v])));
}

export async function importarIbge(pool: Pool): Promise<{ ufs: number; municipios: number }> {
  const ufs = lerCsv('ufs.csv');
  const muns = lerCsv('municipios.csv');
  const siglaPorCodigo = new Map(ufs.map((u) => [u.codigo_uf, u.sigla]));

  await pool.query(
    `INSERT INTO uf (codigo, sigla, nome, regiao, latitude, longitude)
     SELECT * FROM unnest($1::smallint[], $2::char(2)[], $3::text[], $4::text[], $5::numeric[], $6::numeric[])
     ON CONFLICT (codigo) DO UPDATE SET sigla = EXCLUDED.sigla, nome = EXCLUDED.nome, regiao = EXCLUDED.regiao,
       latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude`,
    [ufs.map((u) => u.codigo_uf), ufs.map((u) => u.sigla), ufs.map((u) => u.nome), ufs.map((u) => u.regiao),
     ufs.map((u) => u.latitude), ufs.map((u) => u.longitude)],
  );
  await pool.query(
    `INSERT INTO municipio (codigo_ibge, nome, uf, latitude, longitude, capital)
     SELECT * FROM unnest($1::int[], $2::text[], $3::char(2)[], $4::numeric[], $5::numeric[], $6::boolean[])
     ON CONFLICT (codigo_ibge) DO UPDATE SET nome = EXCLUDED.nome, uf = EXCLUDED.uf,
       latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, capital = EXCLUDED.capital`,
    [muns.map((m) => m.codigo_ibge), muns.map((m) => m.nome), muns.map((m) => siglaPorCodigo.get(m.codigo_uf)),
     muns.map((m) => m.latitude), muns.map((m) => m.longitude), muns.map((m) => m.capital === '1')],
  );
  return { ufs: ufs.length, municipios: muns.length };
}

if (require.main === module) {
  const pool = criarPool();
  importarIbge(pool)
    .then((r) => console.log(`[ibge] ${r.ufs} UFs e ${r.municipios} municípios importados.`))
    .catch((erro) => { console.error(erro); process.exitCode = 1; })
    .finally(() => pool.end());
}
