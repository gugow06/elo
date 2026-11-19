-- Código de retirada: 4 números que só quem pediu vê (app e mensagens para ele). O protocolo é
-- compartilhado com quem ajuda (para entregar no ponto); para RETIRAR, é preciso também o código.
ALTER TABLE solicitacao ADD COLUMN codigo_retirada char(4) NOT NULL DEFAULT lpad(floor(random() * 10000)::int::text, 4, '0');

-- Retiradas registradas (painel do agente, sensor do ponto ou o próprio app de quem pediu)
CREATE TABLE retirada (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id  uuid NOT NULL REFERENCES solicitacao(id),
  ponto_coleta_id uuid REFERENCES ponto_coleta(id),
  origem          text NOT NULL CHECK (origem IN ('painel', 'sensor', 'app')),
  registrado_por  uuid REFERENCES usuario(id),
  criado_em       timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE retirada_item (
  retirada_id uuid NOT NULL REFERENCES retirada(id) ON DELETE CASCADE,
  item_id     uuid NOT NULL REFERENCES item_solicitacao(id) ON DELETE CASCADE,
  PRIMARY KEY (retirada_id, item_id)
);
