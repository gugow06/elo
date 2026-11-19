-- Agente do ponto de coleta: no painel, registra pelo protocolo o que cada pessoa trouxe.
ALTER TYPE perfil_usuario ADD VALUE IF NOT EXISTS 'agente';

-- Item que chegou ao ponto (ainda não retirado por quem pediu) e quanto chegou no total.
-- Alimento, material escolar e outros podem chegar mais de uma vez (quantidade soma).
ALTER TABLE item_solicitacao ADD COLUMN entregue_em timestamptz;
ALTER TABLE item_solicitacao ADD COLUMN quantidade_entregue integer NOT NULL DEFAULT 0 CHECK (quantidade_entregue >= 0);

-- Entrega registrada no painel, por quem registrou e (se souber) quem trouxe.
ALTER TABLE entrega DROP CONSTRAINT IF EXISTS entrega_origem_check;
ALTER TABLE entrega ADD CONSTRAINT entrega_origem_check CHECK (origem IN ('sensor', 'manual', 'painel'));
ALTER TABLE entrega ADD COLUMN registrado_por uuid REFERENCES usuario(id);
ALTER TABLE entrega ADD COLUMN voluntario_id uuid REFERENCES usuario(id);

CREATE TABLE entrega_item (
  entrega_id uuid NOT NULL REFERENCES entrega(id) ON DELETE CASCADE,
  item_id    uuid NOT NULL REFERENCES item_solicitacao(id) ON DELETE CASCADE,
  quantidade integer NOT NULL CHECK (quantidade BETWEEN 1 AND 999),
  PRIMARY KEY (entrega_id, item_id)
);
