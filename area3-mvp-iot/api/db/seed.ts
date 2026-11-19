/**
 * Dados FICTÍCIOS de demonstração. Nenhum dado real de cidadão.
 * Cria 2 municípios, bairros, pontos de coleta e usuários de cada perfil.
 * Pode ser executado várias vezes: limpa o que criou antes.
 */
import { criarPool } from './conexao';
import { sha256 } from '../src/infra/hash';

/** Gera um CPF fictício com dígitos verificadores válidos a partir de 9 dígitos base. */
export function cpfFicticio(base9: string): string {
  const d = base9.split('').map(Number);
  const dv = (nums: number[], pesoInicial: number) => {
    const soma = nums.reduce((acc, n, i) => acc + n * (pesoInicial - i), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = dv(d, 10);
  const d2 = dv([...d, d1], 11);
  return `${base9}${d1}${d2}`;
}

export const CHAVES_DEMO = {
  'ponto-vila-nova': 'demo-chave-ponto-vila-nova',
  'ponto-jardim': 'demo-chave-ponto-jardim',
  'ponto-campo-centro': 'demo-chave-ponto-campo-centro',
} as const;

export async function seed(url?: string): Promise<void> {
  const pool = criarPool(url);
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(`TRUNCATE evento_auditoria, notificacao, evento_iot, entrega, oferta, classificacao, relato,
                   solicitacao, codigo_acesso, usuario, ponto_coleta, bairro, municipio RESTART IDENTITY CASCADE`);

    const mun = async (nome: string, uf: string, populacao: number) =>
      (await c.query<{ id: string }>('INSERT INTO municipio (nome, uf, populacao) VALUES ($1,$2,$3) RETURNING id', [nome, uf, populacao])).rows[0].id;
    const bai = async (m: string, nome: string, slug: string, populacao: number) =>
      (await c.query<{ id: string }>('INSERT INTO bairro (municipio_id, nome, slug, populacao) VALUES ($1,$2,$3,$4) RETURNING id', [m, nome, slug, populacao])).rows[0].id;
    const ponto = async (m: string, b: string, slug: keyof typeof CHAVES_DEMO, nome: string, endereco: string, cap: number, estoque: number) =>
      (await c.query<{ id: string }>(
        `INSERT INTO ponto_coleta (municipio_id, bairro_id, nome, endereco, capacidade_kg, estoque_kg, device_key_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [m, b, nome, endereco, cap, estoque, sha256(CHAVES_DEMO[slug])],
      )).rows[0].id;
    const usr = async (m: string, b: string | null, perfil: string, nome: string, base9: string, telefone: string, nasc: string) =>
      (await c.query<{ id: string }>(
        `INSERT INTO usuario (municipio_id, bairro_id, perfil, nome, cpf, telefone, data_nascimento)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [m, b, perfil, nome, cpfFicticio(base9), telefone, nasc],
      )).rows[0].id;

    // Município 1 (fictício)
    const m1 = await mun('São Bento do Vale', 'SP', 48000);
    const vilaNova = await bai(m1, 'Vila Nova', 'vila-nova', 9200);
    const jardimSP = await bai(m1, 'Jardim São Pedro', 'jardim-sao-pedro', 12400);
    const centro = await bai(m1, 'Centro', 'centro', 7800);
    const jardim = await bai(m1, 'Jardim', 'jardim', 10600);
    await ponto(m1, vilaNova, 'ponto-vila-nova', 'Ponto de Coleta Vila Nova', 'Escola Municipal Vila Nova, portão lateral', 300, 84);
    await ponto(m1, jardim, 'ponto-jardim', 'Ponto de Coleta CRAS Jardim', 'CRAS Jardim, recepção', 400, 36);

    await usr(m1, jardimSP, 'cidadao', 'Ana Paula Ribeiro', '123456789', '+5511990000001', '1997-03-14');
    await usr(m1, vilaNova, 'cidadao', 'Maria das Dores Lima', '234567891', '+5511990000002', '1954-08-02');
    await usr(m1, centro, 'cidadao', 'José Carlos Souza', '345678912', '+5511990000003', '1992-11-20');
    await usr(m1, vilaNova, 'voluntario', 'Cláudia Martins', '456789123', '+5511990000004', '1985-05-09');
    await usr(m1, jardim, 'voluntario', 'Roberto Alves', '567891234', '+5511990000005', '1979-01-30');
    await usr(m1, jardim, 'tecnico', 'Fernanda Costa', '678912345', '+5511990000006', '1988-07-17');
    await usr(m1, centro, 'gestor', 'Secretaria de Assistência Social', '789123456', '+5511990000007', '1975-04-01');

    // Município 2 (fictício), usado para provar o isolamento entre municípios
    const m2 = await mun('Campo Alegre do Norte', 'SP', 31000);
    const campoCentro = await bai(m2, 'Centro', 'centro', 8100);
    await bai(m2, 'Vila Esperança', 'vila-esperanca', 6900);
    await ponto(m2, campoCentro, 'ponto-campo-centro', 'Ponto de Coleta Centro', 'Ginásio Municipal', 250, 120);
    await usr(m2, campoCentro, 'cidadao', 'Luiz Fernando Rocha', '891234567', '+5511990000008', '1990-09-09');
    await usr(m2, campoCentro, 'tecnico', 'Patrícia Gomes', '912345678', '+5511990000009', '1983-12-12');

    await c.query('COMMIT');
  } catch (erro) {
    await c.query('ROLLBACK');
    throw erro;
  } finally {
    c.release();
    await pool.end();
  }
}

if (require.main === module) {
  seed()
    .then(() => console.log('Seed de demonstração aplicado (dados fictícios).'))
    .catch((erro) => {
      console.error(erro);
      process.exit(1);
    });
}
