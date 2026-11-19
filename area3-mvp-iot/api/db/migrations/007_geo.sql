-- Base geográfica real: UFs e municípios do IBGE, com coordenadas.
-- Municípios importados de db/dados (pnpm db:ibge); os do seed de desenvolvimento ficam sem código IBGE.
CREATE TABLE uf (
  codigo    smallint PRIMARY KEY,
  sigla     char(2) NOT NULL UNIQUE,
  nome      text NOT NULL,
  regiao    text NOT NULL,
  latitude  numeric(9,6) NOT NULL,
  longitude numeric(9,6) NOT NULL
);

ALTER TABLE municipio
  ADD COLUMN codigo_ibge integer UNIQUE,
  ADD COLUMN latitude numeric(9,6),
  ADD COLUMN longitude numeric(9,6),
  ADD COLUMN capital boolean NOT NULL DEFAULT false,
  ALTER COLUMN populacao DROP NOT NULL;

-- Busca sem acento e sem diferenciar maiúsculas ("sao paulo" acha "São Paulo")
ALTER TABLE municipio ADD COLUMN nome_busca text GENERATED ALWAYS AS (
  translate(lower(nome), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')
) STORED;
CREATE INDEX municipio_nome_busca ON municipio (nome_busca text_pattern_ops);
CREATE INDEX municipio_uf ON municipio (uf);

-- Centroide do bairro: o mapa mostra pedidos só agregados aqui, nunca no endereço
ALTER TABLE bairro
  ADD COLUMN latitude numeric(9,6),
  ADD COLUMN longitude numeric(9,6),
  ALTER COLUMN populacao DROP NOT NULL;
