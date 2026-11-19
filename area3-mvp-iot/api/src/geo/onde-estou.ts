import { Pool } from 'pg';
import { pedirJson, UFS } from './geocodificador';
import { normalizar } from './bairros';

/**
 * "Onde estou": a posição do aparelho (GPS ou rede, com a permissão da pessoa) vira cidade do IBGE e
 * bairro, para preencher a criação de conta. A API não guarda a posição: só devolve a cidade e o bairro.
 */
export type OndeEstou = {
  municipio: { id: string; nome: string; uf: string } | null;
  bairro: { id: string | null; nome: string } | null;
};

type Endereco = { cidade: string | null; uf: string | null; bairro: string | null };

const SIGLAS = new Set(Object.values(UFS));

async function reversoNominatim(lat: number, lon: number): Promise<Endereco> {
  const base = (process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org/search').replace(/\/search$/, '/reverse');
  const r = await pedirJson<{ address?: Record<string, string> }>('nominatim', `${base}?lat=${lat}&lon=${lon}&format=jsonv2&zoom=16&addressdetails=1`, 1100);
  const a = r.address ?? {};
  const uf = a['ISO3166-2-lvl4']?.replace(/^BR-/, '') ?? (a.state ? UFS[a.state] : undefined) ?? null;
  return {
    cidade: a.city ?? a.town ?? a.village ?? a.municipality ?? null,
    uf: uf && SIGLAS.has(uf) ? uf : null,
    bairro: a.suburb ?? a.neighbourhood ?? a.quarter ?? a.city_district ?? null,
  };
}

async function reversoPhoton(lat: number, lon: number): Promise<Endereco> {
  const base = (process.env.GEOCODER_URL || 'https://photon.komoot.io/api/').replace(/\/api\/?$/, '/reverse');
  const r = await pedirJson<{ features?: { properties?: Record<string, string> }[] }>('photon', `${base}?lat=${lat}&lon=${lon}`, 1000);
  const p = r.features?.[0]?.properties ?? {};
  const uf = p.state ? (UFS[p.state] ?? null) : null;
  return { cidade: p.city ?? p.county ?? null, uf, bairro: p.district ?? p.locality ?? null };
}

export async function ondeEstou(pool: Pool, lat: number, lon: number): Promise<OndeEstou> {
  let e: Endereco = { cidade: null, uf: null, bairro: null };
  try {
    e = await reversoNominatim(lat, lon);
  } catch {
    try {
      e = await reversoPhoton(lat, lon);
    } catch {
      // sem serviço: fica com o município mais perto (abaixo)
    }
  }

  // Cidade do IBGE: pelo nome e UF; sem isso, o município de centro mais perto (no mesmo estado, se souber)
  let municipio: { id: string; nome: string; uf: string } | undefined;
  if (e.cidade && e.uf) {
    // Mesma normalização da coluna nome_busca (minúsculas, sem acento, mantém hífen e apóstrofo)
    const nome = e.cidade.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    municipio = (await pool.query<{ id: string; nome: string; uf: string }>(
      'SELECT id, nome, uf FROM municipio WHERE nome_busca = $1 AND uf = $2 AND codigo_ibge IS NOT NULL LIMIT 1',
      [nome, e.uf],
    )).rows[0];
  }
  if (!municipio) {
    municipio = (await pool.query<{ id: string; nome: string; uf: string }>(
      `SELECT id, nome, uf FROM municipio
       WHERE codigo_ibge IS NOT NULL AND latitude IS NOT NULL AND ($3::text IS NULL OR uf = $3)
       ORDER BY (latitude - $1) ^ 2 + ((longitude - $2) * cos(radians($1))) ^ 2
       LIMIT 1`,
      [lat, lon, e.uf],
    )).rows[0];
  }
  if (!municipio) return { municipio: null, bairro: null };

  let bairro: OndeEstou['bairro'] = null;
  if (e.bairro) {
    const existente = (await pool.query<{ id: string; nome: string }>(
      'SELECT id, nome FROM bairro WHERE municipio_id = $1 AND slug = $2',
      [municipio.id, normalizar(e.bairro).replace(/ /g, '-')],
    )).rows[0];
    bairro = existente ? { id: existente.id, nome: existente.nome } : { id: null, nome: e.bairro };
  }
  return { municipio, bairro };
}
