-- Quando a API procurou a posição do bairro no OpenStreetMap (mesmo sem achar), para não repetir a busca.
ALTER TABLE bairro ADD COLUMN posicao_buscada_em timestamptz;
