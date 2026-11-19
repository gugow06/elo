import { Logger } from '@nestjs/common';
import { aoLimparCaches, buscarLugares, Lugar, pedirJson, UFS } from './geocodificador';

/**
 * Busca de endereço do painel (Locais da rede): o gestor digita o nome do lugar, o endereço ou o CEP
 * e escolhe um resultado; ninguém digita latitude e longitude.
 *
 * 1. Serviço com base própria de endereços, que acerta o número da casa (os abertos param na rua):
 *    TomTom (TOMTOM_API_KEY; plano gratuito sem cartão) ou Google Geocoding (GOOGLE_MAPS_API_KEY).
 * 2. Sem chave (ou sem resultado): CEP (AwesomeAPI, BrasilAPI) + Nominatim + Photon, de bases abertas
 *    (OpenStreetMap e CEP), com cache de 24 h e fila de uso justo por serviço.
 */
const log = new Logger('Enderecos');
const CACHE_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { em: number; lugares: Lugar[] }>();
aoLimparCaches(() => cache.clear());

const RE_CEP = /\b(\d{5})-?(\d{3})\b/;
const SIGLAS = new Set(Object.values(UFS));
const junta = (partes: (string | null | undefined)[], sep = ', ') => partes.filter(Boolean).join(sep);
const montarEndereco = (rua: string, bairro: string | null, cidade: string | null, uf: string | null, cep: string | null) =>
  junta([rua, bairro, cidade && uf ? `${cidade} - ${uf}` : cidade, cep]);
const formatarCep = (cep: string) => `${cep.slice(0, 5)}-${cep.slice(5)}`;

// ---------- Google Geocoding
type ComponenteGoogle = { long_name: string; short_name: string; types: string[] };
type ResultadoGoogle = {
  formatted_address: string;
  address_components: ComponenteGoogle[];
  geometry: { location: { lat: number; lng: number } };
};

async function google(q: string, chave: string): Promise<Lugar[]> {
  const url =
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}` +
    `&components=country:BR&region=br&language=pt-BR&key=${encodeURIComponent(chave)}`;
  const r = await pedirJson<{ status: string; results?: ResultadoGoogle[]; error_message?: string }>('google', url);
  if (r.status !== 'OK' && r.status !== 'ZERO_RESULTS') {
    throw new Error(`Google respondeu ${r.status}${r.error_message ? `: ${r.error_message}` : ''}`);
  }
  return (r.results ?? []).map((g) => {
    const c = (tipo: string, curto = false) => {
      const x = g.address_components.find((a) => a.types.includes(tipo));
      return x ? (curto ? x.short_name : x.long_name) : null;
    };
    const rua = junta([c('route'), c('street_number')]);
    const bairro = c('sublocality_level_1') ?? c('sublocality') ?? c('neighborhood');
    const cidade = c('administrative_area_level_2') ?? c('locality');
    const uf = c('administrative_area_level_1', true);
    const cep = c('postal_code');
    const nome = c('establishment') ?? c('point_of_interest') ?? (rua || g.formatted_address.split(',')[0]);
    return {
      nome,
      endereco: montarEndereco(rua, bairro, cidade, uf, cep) || g.formatted_address,
      bairro,
      cidade,
      uf,
      cep,
      latitude: g.geometry.location.lat,
      longitude: g.geometry.location.lng,
    };
  });
}

// ---------- TomTom Search (busca livre: endereço com número e nome de lugar)
type ResultadoTomTom = {
  type: string;
  poi?: { name?: string };
  position: { lat: number; lon: number };
  address: {
    streetName?: string; streetNumber?: string; municipalitySubdivision?: string; municipality?: string;
    countrySubdivision?: string; countrySubdivisionCode?: string; postalCode?: string; extendedPostalCode?: string;
    freeformAddress?: string; countryCode?: string;
  };
};

async function tomtom(q: string, chave: string): Promise<Lugar[]> {
  const url =
    `https://api.tomtom.com/search/2/search/${encodeURIComponent(q.replace(/[/?#]/g, ' '))}.json` +
    `?key=${encodeURIComponent(chave)}&countrySet=BR&language=pt-BR&limit=6`;
  const r = await pedirJson<{ results?: ResultadoTomTom[] }>('tomtom', url, 250);
  return (r.results ?? []).flatMap((t) => {
    const a = t.address;
    if (a.countryCode && a.countryCode !== 'BR') return [];
    const sub = a.countrySubdivisionCode ?? a.countrySubdivision ?? '';
    const uf = SIGLAS.has(sub) ? sub : (UFS[sub] ?? null);
    const rua = junta([a.streetName, a.streetNumber]);
    const cidade = a.municipality ?? null;
    const bairro = a.municipalitySubdivision && a.municipalitySubdivision !== cidade ? a.municipalitySubdivision : null;
    const cep = a.extendedPostalCode ?? a.postalCode ?? null;
    const nome = t.poi?.name ?? (rua || a.freeformAddress || cidade || 'Local sem nome');
    return [{
      nome,
      endereco: montarEndereco(t.poi?.name ? rua : (rua === nome ? '' : rua), bairro, cidade, uf, cep) || (a.freeformAddress ?? ''),
      bairro, cidade, uf, cep,
      latitude: t.position.lat,
      longitude: t.position.lon,
    }];
  });
}

// ---------- CEP com coordenadas (trecho da rua)
type Cep = { rua?: string; bairro?: string; cidade?: string; uf?: string; lat?: string; lng?: string };

function deCep(cep: string, c: Cep): Lugar[] {
  if (!c.lat || !c.lng) return [];
  const cepF = formatarCep(cep);
  return [{
    nome: c.rua || `CEP ${cepF}`,
    endereco: montarEndereco(c.rua ?? '', c.bairro ?? null, c.cidade ?? null, c.uf ?? null, cepF),
    bairro: c.bairro ?? null,
    cidade: c.cidade ?? null,
    uf: c.uf ?? null,
    cep: cepF,
    latitude: Number(c.lat),
    longitude: Number(c.lng),
  }];
}

async function porCep(cep: string): Promise<Lugar[]> {
  try {
    const a = await pedirJson<{ address?: string; district?: string; city?: string; state?: string; lat?: string; lng?: string }>(
      'awesomeapi',
      `https://cep.awesomeapi.com.br/json/${cep}`,
    );
    const l = deCep(cep, { rua: a.address, bairro: a.district, cidade: a.city, uf: a.state, lat: a.lat, lng: a.lng });
    if (l.length) return l;
  } catch {
    // tenta a BrasilAPI
  }
  const b = await pedirJson<{
    street?: string; neighborhood?: string; city?: string; state?: string;
    location?: { coordinates?: { latitude?: string; longitude?: string } };
  }>('brasilapi', `https://brasilapi.com.br/api/cep/v2/${cep}`);
  const co = b.location?.coordinates;
  return deCep(cep, { rua: b.street, bairro: b.neighborhood, cidade: b.city, uf: b.state, lat: co?.latitude, lng: co?.longitude });
}

// ---------- Nominatim (OpenStreetMap): entende melhor endereço brasileiro que o Photon
type ResultadoNominatim = { lat: string; lon: string; name?: string; display_name: string; address?: Record<string, string> };

async function nominatim(q: string): Promise<Lugar[]> {
  const base = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org/search';
  const url = `${base}?q=${encodeURIComponent(q)}&format=jsonv2&countrycodes=br&addressdetails=1&limit=6`;
  // Política de uso do Nominatim público: no máximo 1 consulta por segundo
  const r = await pedirJson<ResultadoNominatim[]>('nominatim', url, 1100);
  return r.flatMap((n) => {
    const a = n.address ?? {};
    const uf = a['ISO3166-2-lvl4']?.replace(/^BR-/, '') ?? (a.state ? UFS[a.state] : undefined) ?? null;
    if (!uf || !SIGLAS.has(uf)) return [];
    const rua = junta([a.road ?? a.pedestrian, a.house_number]);
    const bairro = a.suburb ?? a.neighbourhood ?? a.city_district ?? a.quarter ?? null;
    const cidade = a.city ?? a.town ?? a.village ?? a.municipality ?? null;
    const nome = n.name || rua || n.display_name.split(',')[0];
    const endereco = montarEndereco(rua === nome ? '' : rua, bairro, cidade, uf, a.postcode ?? null) || n.display_name;
    return [{ nome, endereco, bairro, cidade, uf, cep: a.postcode ?? null, latitude: Number(n.lat), longitude: Number(n.lon) }];
  });
}

/** Resultados a menos de ~30 m e com o mesmo nome contam como o mesmo lugar. */
function semRepetidos(lugares: Lugar[]): Lugar[] {
  const fora: Lugar[] = [];
  for (const l of lugares) {
    const igual = fora.some(
      (o) => o.nome.toLowerCase() === l.nome.toLowerCase() && Math.abs(o.latitude - l.latitude) < 0.0003 && Math.abs(o.longitude - l.longitude) < 0.0003,
    );
    if (!igual) fora.push(l);
  }
  return fora.slice(0, 8);
}

export async function buscarEndereco(q: string): Promise<Lugar[]> {
  const chaveCache = q.trim().toLowerCase().replace(/\s+/g, ' ');
  const guardado = cache.get(chaveCache);
  if (guardado && Date.now() - guardado.em < CACHE_MS) return guardado.lugares;

  let lugares: Lugar[] = [];
  // Serviços com chave, na ordem: o primeiro que responder com resultado vale
  const comChave: [string, string | undefined, (q: string, chave: string) => Promise<Lugar[]>][] = [
    ['TomTom', process.env.TOMTOM_API_KEY, tomtom],
    ['Google Geocoding', process.env.GOOGLE_MAPS_API_KEY, google],
  ];
  for (const [nome, chave, servico] of comChave) {
    if (!chave || lugares.length) continue;
    try {
      lugares = await servico(q, chave);
    } catch (e) {
      log.warn(`${nome} falhou, tentando o próximo serviço: ${(e as Error).message.replaceAll(chave, '***')}`);
    }
  }
  if (!lugares.length) {
    const cep = RE_CEP.exec(q);
    const tentativas = await Promise.allSettled([cep ? porCep(cep[1] + cep[2]) : Promise.resolve([]), nominatim(q), buscarLugares(q)]);
    const falhou = (i: number) => tentativas[i].status === 'rejected';
    if (falhou(1) && falhou(2) && (!cep || falhou(0))) throw new Error('nenhum serviço de endereço respondeu');
    const ok = tentativas.filter((t): t is PromiseFulfilledResult<Lugar[]> => t.status === 'fulfilled');
    const doCep = tentativas[0].status === 'fulfilled' ? tentativas[0].value : [];
    // CEP encontrado: é a resposta (os outros serviços leem o CEP como número de casa e devolvem lixo)
    lugares = doCep.length ? doCep : semRepetidos(ok.flatMap((t) => t.value));
  }
  cache.set(chaveCache, { em: Date.now(), lugares });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return lugares;
}
