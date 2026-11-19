-- Pedido com itens (decisão D3: oferta por item). Várias pessoas ajudam o mesmo pedido, cada uma
-- com os itens que vai levar. Quem pediu marca o que já recebeu (F7-D4).
CREATE TABLE item_solicitacao (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL REFERENCES solicitacao(id) ON DELETE CASCADE,
  descricao      text NOT NULL,
  ordem          smallint NOT NULL DEFAULT 0,
  obtido_em      timestamptz,
  criado_em      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX item_solicitacao_pedido ON item_solicitacao (solicitacao_id, ordem);

-- Itens que cada oferta (pessoa ajudando) se comprometeu a levar
CREATE TABLE oferta_item (
  oferta_id uuid NOT NULL REFERENCES oferta(id) ON DELETE CASCADE,
  item_id   uuid NOT NULL REFERENCES item_solicitacao(id) ON DELETE CASCADE,
  PRIMARY KEY (oferta_id, item_id)
);
CREATE INDEX oferta_item_item ON oferta_item (item_id);

-- Antes: uma oferta ativa por pedido. Agora: uma por pessoa em cada pedido.
DROP INDEX oferta_unica_ativa;
CREATE UNIQUE INDEX oferta_unica_por_pessoa ON oferta (solicitacao_id, voluntario_id) WHERE ativa;

-- Itens padrão para os pedidos que já existem
INSERT INTO item_solicitacao (solicitacao_id, descricao, ordem)
SELECT s.id, i.descricao, i.ordem
FROM solicitacao s
JOIN (VALUES
  ('alimento', 'Arroz', 1), ('alimento', 'Feijão', 2), ('alimento', 'Óleo', 3), ('alimento', 'Leite', 4), ('alimento', 'Itens de higiene básica', 5),
  ('roupa', 'Agasalhos', 1), ('roupa', 'Calças', 2), ('roupa', 'Cobertores', 3), ('roupa', 'Calçados', 4),
  ('movel', 'Móvel em bom estado', 1), ('movel', 'Transporte até o ponto de coleta', 2),
  ('material_escolar', 'Cadernos', 1), ('material_escolar', 'Lápis e canetas', 2), ('material_escolar', 'Mochila', 3), ('material_escolar', 'Estojo', 4)
) AS i(categoria, descricao, ordem) ON i.categoria = s.categoria::text;

INSERT INTO item_solicitacao (solicitacao_id, descricao, ordem)
SELECT s.id, s.titulo, 1 FROM solicitacao s
WHERE s.categoria::text NOT IN ('alimento', 'roupa', 'movel', 'material_escolar');

-- Ofertas que já existem levam todos os itens do pedido
INSERT INTO oferta_item (oferta_id, item_id)
SELECT o.id, i.id FROM oferta o JOIN item_solicitacao i ON i.solicitacao_id = o.solicitacao_id WHERE o.ativa;

-- Pedidos já concluídos: itens recebidos
UPDATE item_solicitacao i SET obtido_em = s.fechado_em
FROM solicitacao s WHERE s.id = i.solicitacao_id AND s.status = 'concluida';
