-- De onde veio a posição do bairro: 'osm' (busca no OpenStreetMap), 'dispositivo' (aproximada, a partir
-- da localização do celular de quem criou a conta, arredondada a ~1 km) ou 'gestor'.
-- A do dispositivo é provisória: se o OpenStreetMap achar o bairro depois, ela é substituída.
ALTER TABLE bairro ADD COLUMN posicao_origem text CHECK (posicao_origem IN ('osm', 'dispositivo', 'gestor'));
UPDATE bairro SET posicao_origem = 'osm' WHERE latitude IS NOT NULL AND posicao_buscada_em IS NOT NULL;
