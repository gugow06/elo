import { afterEach, describe, expect, it } from 'vitest';
import { buscarEndereco } from '../src/geo/enderecos';
import { definirBuscador } from '../src/geo/geocodificador';

type Rota = (url: string) => unknown;

/** Responde cada serviço pelo endereço; o que não tiver rota responde 500. Guarda as URLs pedidas. */
function servicos(rotas: Record<string, Rota>): string[] {
  const pedidas: string[] = [];
  definirBuscador(async (url) => {
    pedidas.push(url);
    const host = Object.keys(rotas).find((h) => url.includes(h));
    return host ? new Response(JSON.stringify(rotas[host](url)), { status: 200 }) : new Response('fora do ar', { status: 500 });
  });
  return pedidas;
}

const NOMINATIM_BARRETO_LEME = [
  {
    lat: '-22.8997435', lon: '-47.0553611', name: 'Rua Barreto Leme', display_name: 'Rua Barreto Leme, Vila Itapura, Campinas, São Paulo, Brasil',
    address: { road: 'Rua Barreto Leme', suburb: 'Vila Itapura', city: 'Campinas', state: 'São Paulo', 'ISO3166-2-lvl4': 'BR-SP', postcode: '13025-063' },
  },
];

const GOOGLE_BARRETO_LEME = {
  status: 'OK',
  results: [
    {
      formatted_address: 'R. Barreto Leme, 1500 - Cambuí, Campinas - SP, 13025-085, Brasil',
      geometry: { location: { lat: -22.8981, lng: -47.0532 } },
      address_components: [
        { long_name: '1500', short_name: '1500', types: ['street_number'] },
        { long_name: 'Rua Barreto Leme', short_name: 'R. Barreto Leme', types: ['route'] },
        { long_name: 'Cambuí', short_name: 'Cambuí', types: ['sublocality_level_1', 'sublocality', 'political'] },
        { long_name: 'Campinas', short_name: 'Campinas', types: ['administrative_area_level_2', 'political'] },
        { long_name: 'São Paulo', short_name: 'SP', types: ['administrative_area_level_1', 'political'] },
        { long_name: '13025-085', short_name: '13025-085', types: ['postal_code'] },
      ],
    },
  ],
};

describe('busca de endereço do painel (sem digitar latitude e longitude)', () => {
  afterEach(() => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    definirBuscador(null);
  });

  it('sem chave do Google: usa o Nominatim (OpenStreetMap) e junta com o Photon', async () => {
    const pedidas = servicos({ nominatim: () => NOMINATIM_BARRETO_LEME, photon: () => ({ features: [] }) });
    const r = await buscarEndereco('Rua Barreto Leme 1500, Campinas');
    expect(r[0]).toEqual(expect.objectContaining({ nome: 'Rua Barreto Leme', bairro: 'Vila Itapura', cidade: 'Campinas', uf: 'SP', latitude: -22.8997435 }));
    expect(pedidas.some((u) => u.includes('countrycodes=br'))).toBe(true);
    expect(pedidas.some((u) => u.includes('googleapis'))).toBe(false);
  });

  it('com GOOGLE_MAPS_API_KEY: usa o Google, que acerta o número', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'chave-de-teste';
    const pedidas = servicos({ googleapis: () => GOOGLE_BARRETO_LEME });
    const [l] = await buscarEndereco('Rua Barreto Leme 1500, Campinas');
    expect(l).toEqual(expect.objectContaining({
      nome: 'Rua Barreto Leme, 1500', bairro: 'Cambuí', cidade: 'Campinas', uf: 'SP', cep: '13025-085', latitude: -22.8981, longitude: -47.0532,
    }));
    expect(l.endereco).toBe('Rua Barreto Leme, 1500, Cambuí, Campinas - SP, 13025-085');
    expect(pedidas).toHaveLength(1);
    expect(pedidas[0]).toContain('components=country:BR');
  });

  it('Google recusando a chave: cai para os serviços abertos', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'chave-invalida';
    servicos({ googleapis: () => ({ status: 'REQUEST_DENIED', error_message: 'The provided API key is invalid.' }), nominatim: () => NOMINATIM_BARRETO_LEME });
    const r = await buscarEndereco('Rua Barreto Leme, Campinas');
    expect(r[0].cidade).toBe('Campinas');
  });

  it('CEP: acha o trecho da rua com coordenadas', async () => {
    servicos({
      awesomeapi: () => ({ address: 'Rua General Osório', district: 'Centro', city: 'Campinas', state: 'SP', lat: '-22.9036552', lng: '-47.0591402' }),
      // Os outros serviços leem "111" como número de casa e devolvem lixo
      nominatim: () => [{ lat: '-21.29', lon: '-44.66', name: '111', display_name: '111, Itutinga', address: { 'ISO3166-2-lvl4': 'BR-MG', city: 'Itutinga' } }],
      photon: () => ({ features: [] }),
    });
    const r = await buscarEndereco('13010-111');
    expect(r).toHaveLength(1);
    const [l] = r;
    expect(l).toEqual(expect.objectContaining({ nome: 'Rua General Osório', bairro: 'Centro', cidade: 'Campinas', uf: 'SP', cep: '13010-111', latitude: -22.9036552 }));
  });

  it('CEP sem coordenadas numa base: tenta a BrasilAPI', async () => {
    servicos({
      awesomeapi: () => ({ address: 'Rua General Osório', city: 'Campinas', state: 'SP' }),
      brasilapi: () => ({ street: 'Rua General Osório', neighborhood: 'Centro', city: 'Campinas', state: 'SP', location: { coordinates: { latitude: '-22.90556', longitude: '-47.06083' } } }),
      nominatim: () => [],
      photon: () => ({ features: [] }),
    });
    const [l] = await buscarEndereco('13010111');
    expect(l.latitude).toBe(-22.90556);
  });

  it('ignora resultado fora do Brasil e falha só se todos os serviços caírem', async () => {
    servicos({ nominatim: () => [{ lat: '-34.6', lon: '-58.38', display_name: 'Buenos Aires', address: { state: 'Buenos Aires' } }], photon: () => ({ features: [] }) });
    expect(await buscarEndereco('Buenos Aires')).toEqual([]);
    servicos({});
    await expect(buscarEndereco('Recife')).rejects.toThrow();
  });
});
