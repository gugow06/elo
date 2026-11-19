-- Locais da rede cadastrados pelo gestor (decisão F7-D3): todos são equipamentos públicos ou de
-- entidades, com endereço público. Pedido de cidadão nunca vira local nem ponto no mapa.
CREATE TYPE tipo_local AS ENUM ('ponto_coleta', 'assistencia', 'abrigo', 'distribuicao', 'saude');

CREATE TABLE local_rede (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipio_id    uuid NOT NULL REFERENCES municipio(id),
  bairro_id       uuid REFERENCES bairro(id),
  tipo            tipo_local NOT NULL,
  nome            text NOT NULL,
  endereco        text NOT NULL,
  latitude        numeric(9,6),
  longitude       numeric(9,6),
  telefone        text,
  horario         text,
  descricao       text,
  -- Ponto de coleta: o que recebe. Distribuição: o que entrega.
  categorias      categoria_pedido[] NOT NULL DEFAULT '{}',
  -- Abrigo: vagas
  vagas           integer CHECK (vagas >= 0),
  -- Ponto de coleta com sensor IoT: liga ao ponto_coleta (capacidade, estoque, chave do dispositivo)
  ponto_coleta_id uuid UNIQUE REFERENCES ponto_coleta(id),
  ativo           boolean NOT NULL DEFAULT true,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX local_rede_geo ON local_rede (latitude, longitude) WHERE ativo;
CREATE INDEX local_rede_municipio ON local_rede (municipio_id, tipo);

-- Os pontos de coleta que já existem viram locais da rede
INSERT INTO local_rede (municipio_id, bairro_id, tipo, nome, endereco, ponto_coleta_id, categorias)
SELECT municipio_id, bairro_id, 'ponto_coleta', nome, endereco, id, '{alimento,roupa,material_escolar}'
FROM ponto_coleta;
