import { Pool, types } from 'pg';

// numeric e bigint chegam como string no driver pg; para indicadores, número é o que se quer.
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));
// date (sem hora) volta como texto AAAA-MM-DD, sem conversão de fuso
types.setTypeParser(1082, (v) => v);

export function criarPool(url = process.env.DATABASE_URL): Pool {
  if (!url) {
    throw new Error('DATABASE_URL não definida. Copie .env.example para .env na raiz do projeto.');
  }
  return new Pool({ connectionString: url, max: 10 });
}
