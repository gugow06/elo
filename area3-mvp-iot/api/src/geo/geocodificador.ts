import { Logger } from '@nestjs/common';

/**
 * Busca de endereço (geocodificação) por um serviço gratuito compatível com o Photon
 * (https://photon.komoot.io, dados do OpenStreetMap). A URL vem de GEOCODER_URL para trocar
 * por um servidor próprio. A API é a única que fala com o serviço: cache de 24 h e no máximo
 * 1 consulta por segundo, respeitando o uso justo do serviço público.
 */
export interface Lugar {
  nome: string;
  endereco: string;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  latitude: number;
  longitude: number;
}

type Buscador = (url: string, init: RequestInit) => Promise<Response>;

const log = new Logger('Geo');
const CACHE_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { em: number; lugares: Lugar[] }>();
let fila: Promise<unknown> = Promise.resolve();
let ultima = 0;
let buscador: Buscador = (url, init) => fetch(url, init);

const filas = new Map<string, { fila: Promise<unknown>; ultima: number }>();
const ouvintesLimpeza: (() => void)[] = [];

/** Só para testes: troca o fetch e limpa caches e filas. */
export function definirBuscador(b: Buscador | null): void {
  buscador = b ?? ((url, init) => fetch(url, init));
  cache.clear();
  ultima = 0;
  filas.clear();
  for (const f of ouvintesLimpeza) f();
}

/** Para outros módulos limparem o próprio cache junto (testes). */
export function aoLimparCaches(f: () => void): void {
  ouvintesLimpeza.push(f);
}

/**
 * GET de JSON num serviço externo, em fila por serviço: no máximo uma consulta a cada `intervaloMs`
 * (uso justo dos serviços públicos). O endereço completo nunca vai para o log (pode ter chave).
 */
export async function pedirJson<T>(servico: string, url: string, intervaloMs = 0): Promise<T> {
  const f = filas.get(servico) ?? { fila: Promise.resolve(), ultima: 0 };
  filas.set(servico, f);
  const tarefa = f.fila.then(async () => {
    const espera = f.ultima + intervaloMs - Date.now();
    if (espera > 0) await new Promise((r) => setTimeout(r, espera));
    f.ultima = Date.now();
    const r = await buscador(url, {
      headers: { 'user-agent': 'ELO-app/1.0 (rede de ajuda; painel de gestao)', accept: 'application/json', 'accept-language': 'pt-BR' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`${servico} respondeu ${r.status}`);
    return (await r.json()) as T;
  });
  f.fila = tarefa.catch(() => undefined);
  return tarefa;
}

export const UFS: Record<string, string> = {
  Acre: 'AC', Alagoas: 'AL', Amapá: 'AP', Amazonas: 'AM', Bahia: 'BA', Ceará: 'CE', 'Distrito Federal': 'DF',
  'Espírito Santo': 'ES', Goiás: 'GO', Maranhão: 'MA', 'Mato Grosso': 'MT', 'Mato Grosso do Sul': 'MS',
  'Minas Gerais': 'MG', Pará: 'PA', Paraíba: 'PB', Paraná: 'PR', Pernambuco: 'PE', Piauí: 'PI',
  'Rio de Janeiro': 'RJ', 'Rio Grande do Norte': 'RN', 'Rio Grande do Sul': 'RS', Rondônia: 'RO', Roraima: 'RR',
  'Santa Catarina': 'SC', 'São Paulo': 'SP', Sergipe: 'SE', Tocantins: 'TO',
};

type Feature = { geometry?: { coordinates?: [number, number] }; properties?: Record<string, string | undefined> };

function paraLugar(f: Feature): Lugar | null {
  const c = f.geometry?.coordinates;
  const p = f.properties ?? {};
  if (!c) return null;
  const rua = [p.street, p.housenumber].filter(Boolean).join(', ');
  const bairro = p.district ?? p.locality ?? null;
  const cidade = p.city ?? p.county ?? null;
  const uf = p.state ? (UFS[p.state] ?? p.state) : null;
  const nome = p.name ?? (rua || cidade || 'Local sem nome');
  const endereco = [rua || (p.name && p.name !== nome ? p.name : ''), bairro, cidade && uf ? `${cidade} - ${uf}` : cidade, p.postcode]
    .filter(Boolean)
    .join(', ');
  return { nome, endereco, bairro, cidade, uf, cep: p.postcode ?? null, latitude: c[1], longitude: c[0] };
}

/** `perto`: prioriza resultados perto deste ponto. `soLugares`: só bairros, cidades etc. (osm_tag=place). */
export type OpcoesBusca = { perto?: { latitude: number; longitude: number }; soLugares?: boolean };

export async function buscarLugares(q: string, opcoes: OpcoesBusca = {}): Promise<Lugar[]> {
  const extra =
    (opcoes.perto ? `&lat=${opcoes.perto.latitude}&lon=${opcoes.perto.longitude}` : '') + (opcoes.soLugares ? '&osm_tag=place' : '');
  const chave = q.trim().toLowerCase() + extra;
  const guardado = cache.get(chave);
  if (guardado && Date.now() - guardado.em < CACHE_MS) return guardado.lugares;

  const base = process.env.GEOCODER_URL || 'https://photon.komoot.io/api/';
  // Só Brasil (caixa aproximada do território)
  const url = `${base}?q=${encodeURIComponent(q)}&limit=${opcoes.soLugares ? 10 : 6}&bbox=-74.0,-34.0,-34.7,5.3${extra}`;
  const tarefa = fila.then(async () => {
    const espera = ultima + 1000 - Date.now();
    if (espera > 0) await new Promise((r) => setTimeout(r, espera));
    ultima = Date.now();
    const r = await buscador(url, { headers: { 'user-agent': 'ELO-app/1.0', accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`geocodificador respondeu ${r.status}`);
    const corpo = (await r.json()) as { features?: Feature[] };
    return (corpo.features ?? []).map(paraLugar).filter((l): l is Lugar => !!l && l.uf !== null && l.uf.length === 2);
  });
  fila = tarefa.catch(() => undefined);
  try {
    const lugares = await tarefa;
    cache.set(chave, { em: Date.now(), lugares });
    if (cache.size > 500) cache.delete(cache.keys().next().value!);
    return lugares;
  } catch (erro) {
    log.warn(`Busca de endereço falhou: ${(erro as Error).message}`);
    throw erro;
  }
}
