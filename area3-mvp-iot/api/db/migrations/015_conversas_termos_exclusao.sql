-- Conversa entre quem pediu e quem está ajudando (uma por pessoa em cada pedido).
-- Só existe conversa entre pessoas ligadas por um pedido: ninguém manda mensagem a um desconhecido.
CREATE TABLE conversa (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL REFERENCES solicitacao(id) ON DELETE CASCADE,
  cidadao_id     uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  voluntario_id  uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  criada_em      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (solicitacao_id, voluntario_id)
);
CREATE INDEX conversa_cidadao ON conversa (cidadao_id);
CREATE INDEX conversa_voluntario ON conversa (voluntario_id);

CREATE TABLE mensagem (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id uuid NOT NULL REFERENCES conversa(id) ON DELETE CASCADE,
  autor_id    uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  texto       text NOT NULL CHECK (length(texto) BETWEEN 1 AND 1000),
  criada_em   timestamptz NOT NULL DEFAULT now(),
  lida_em     timestamptz
);
CREATE INDEX mensagem_conversa ON mensagem (conversa_id, criada_em);

-- Ofertas que já existem ganham a conversa
INSERT INTO conversa (solicitacao_id, cidadao_id, voluntario_id)
SELECT DISTINCT ON (o.solicitacao_id, o.voluntario_id) o.solicitacao_id, s.cidadao_id, o.voluntario_id
FROM oferta o JOIN solicitacao s ON s.id = o.solicitacao_id
WHERE o.voluntario_id <> s.cidadao_id
ON CONFLICT DO NOTHING;

-- Termos de uso e política de privacidade: versão aceita e quando
ALTER TABLE usuario ADD COLUMN termos_versao text;
ALTER TABLE usuario ADD COLUMN termos_aceitos_em timestamptz;

-- Exclusão de conta (LGPD): os dados pessoais são apagados e a linha fica anônima,
-- porque pedidos e entregas continuam no histórico do serviço público.
ALTER TABLE usuario ADD COLUMN excluido_em timestamptz;
