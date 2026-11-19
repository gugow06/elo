import { Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { buscarLugares } from './geocodificador';

/**
 * Posição dos bairros. Pedidos aparecem no mapa só agregados por bairro; sem a posição do bairro,
 * o mapa usa o centro do município (e avisa que é aproximado). Aqui a API procura o bairro no
 * OpenStreetMap e só aceita o resultado se o nome do bairro e a cidade baterem e o ponto estiver
 * perto do município: o buscador devolve bairros homônimos de cidades vizinhas e até rodovias.
 */
const log = new Logger('Bairros');
const DISTANCIA_MAX_KM = 40;

export const normalizar = (s: string) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function distanciaKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = (g: number) => (g * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Procura a posição do bairro na cidade. null quando não há resultado confiável. */
export async function posicaoDoBairro(
  bairro: string,
  municipio: { nome: string; uf: string; latitude: number | null; longitude: number | null },
): Promise<{ latitude: number; longitude: number } | null> {
  const perto = municipio.latitude != null && municipio.longitude != null ? { latitude: municipio.latitude, longitude: municipio.longitude } : undefined;
  const lugares = await buscarLugares(`${bairro} ${municipio.nome}`, { perto, soLugares: true });
  const alvo = normalizar(bairro);
  const cidade = normalizar(municipio.nome);
  const ok = lugares.find((l) => {
    if (l.uf !== municipio.uf || !l.cidade || normalizar(l.cidade) !== cidade) return false;
    // O próprio bairro (nome do lugar) ou um lugar dentro dele
    if (normalizar(l.nome) !== alvo && (!l.bairro || normalizar(l.bairro) !== alvo)) return false;
    if (municipio.latitude == null || municipio.longitude == null) return true;
    return distanciaKm({ lat: municipio.latitude, lon: municipio.longitude }, { lat: l.latitude, lon: l.longitude }) <= DISTANCIA_MAX_KM;
  });
  return ok ? { latitude: ok.latitude, longitude: ok.longitude } : null;
}

/** Completa a posição de um bairro (sem posição ainda). Devolve se achou. */
export async function completarBairro(pool: Pool, bairroId: string): Promise<boolean> {
  const { rows } = await pool.query<{ nome: string; municipio: string; uf: string; latitude: number | null; longitude: number | null }>(
    `SELECT b.nome, m.nome AS municipio, m.uf, m.latitude::float AS latitude, m.longitude::float AS longitude
     FROM bairro b JOIN municipio m ON m.id = b.municipio_id
     WHERE b.id = $1 AND b.latitude IS NULL AND m.codigo_ibge IS NOT NULL`,
    [bairroId],
  );
  const b = rows[0];
  if (!b) return false;
  const p = await posicaoDoBairro(b.nome, { nome: b.municipio, uf: b.uf, latitude: b.latitude, longitude: b.longitude });
  // Marca a tentativa mesmo sem resultado, para não consultar o mesmo bairro a cada subida da API
  await pool.query(
    'UPDATE bairro SET latitude = $2, longitude = $3, posicao_buscada_em = now() WHERE id = $1',
    [bairroId, p?.latitude ?? null, p?.longitude ?? null],
  );
  log.log(`Bairro "${b.nome}" (${b.municipio} - ${b.uf}): ${p ? 'posição encontrada' : 'sem posição confiável, mapa usa o centro da cidade'}`);
  return !!p;
}

/** Ao subir a API: completa os bairros de municípios reais que ainda não foram procurados. */
export async function completarBairrosSemPosicao(pool: Pool, limite = 200): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT b.id FROM bairro b JOIN municipio m ON m.id = b.municipio_id
     WHERE b.latitude IS NULL AND b.posicao_buscada_em IS NULL AND m.codigo_ibge IS NOT NULL
     ORDER BY b.id LIMIT $1`,
    [limite],
  );
  for (const r of rows) {
    try {
      await completarBairro(pool, r.id);
    } catch (erro) {
      log.warn(`Não foi possível procurar a posição do bairro: ${(erro as Error).message}`);
      return; // buscador fora do ar: tenta de novo na próxima subida
    }
  }
}
