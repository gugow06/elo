-- Login social (Google, Apple, Facebook): vincula a identidade do provedor a um usuário.
-- "sujeito" é o identificador estável que o provedor devolve (claim "sub").
CREATE TYPE provedor_social AS ENUM ('google', 'apple', 'facebook');

CREATE TABLE conta_social (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id   uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  provedor     provedor_social NOT NULL,
  sujeito      text NOT NULL,
  email        text,
  vinculada_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provedor, sujeito),
  UNIQUE (usuario_id, provedor)
);
