import { Pool } from 'pg';

export function criarPool(url = process.env.DATABASE_URL): Pool {
  if (!url) {
    throw new Error('DATABASE_URL não definida. Copie .env.example para .env na raiz do projeto.');
  }
  return new Pool({ connectionString: url, max: 10 });
}
