-- ELO: esquema operacional (schema public)
-- Todas as tabelas de domínio carregam municipio_id (multi-tenant por município).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE perfil_usuario   AS ENUM ('cidadao', 'voluntario', 'tecnico', 'gestor');
CREATE TYPE canal_origem     AS ENUM ('app', 'whatsapp', 'balcao', 'web_leve');
CREATE TYPE faixa_risco      AS ENUM ('verde', 'amarela', 'vermelha');
CREATE TYPE categoria_pedido AS ENUM ('alimento', 'roupa', 'movel', 'material_escolar', 'apoio_idoso', 'transporte', 'outro');
CREATE TYPE status_pedido    AS ENUM ('recebida', 'no_mural', 'em_atendimento', 'na_fila_tecnica', 'entregue', 'concluida', 'cancelada');
CREATE TYPE desfecho_pedido  AS ENUM ('resolvida_rede', 'resolvida_cras', 'encaminhada', 'nao_atendida', 'cancelada');
CREATE TYPE origem_classif   AS ENUM ('regra', 'llm', 'fallback', 'tecnico');

CREATE TABLE municipio (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       text NOT NULL,
  uf         char(2) NOT NULL,
  populacao  integer NOT NULL
);

CREATE TABLE bairro (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipio_id uuid NOT NULL REFERENCES municipio(id),
  nome         text NOT NULL,
  slug         text NOT NULL,
  populacao    integer NOT NULL,
  UNIQUE (municipio_id, slug)
);

CREATE TABLE ponto_coleta (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipio_id    uuid NOT NULL REFERENCES municipio(id),
  bairro_id       uuid NOT NULL REFERENCES bairro(id),
  nome            text NOT NULL,
  -- Endereço de equipamento público: pode ser exibido. Endereço de cidadão nunca é.
  endereco        text NOT NULL,
  capacidade_kg   numeric(8,2) NOT NULL,
  estoque_kg      numeric(8,2) NOT NULL DEFAULT 0,
  device_key_hash text NOT NULL
);

CREATE TABLE usuario (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipio_id    uuid NOT NULL REFERENCES municipio(id),
  bairro_id       uuid REFERENCES bairro(id),
  perfil          perfil_usuario NOT NULL,
  nome            text NOT NULL,
  cpf             char(11) UNIQUE,
  telefone        text NOT NULL,
  data_nascimento date,
  criado_em       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE codigo_acesso (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  uuid NOT NULL REFERENCES usuario(id),
  codigo_hash text NOT NULL,
  expira_em   timestamptz NOT NULL,
  usado_em    timestamptz
);

CREATE TABLE solicitacao (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipio_id         uuid NOT NULL REFERENCES municipio(id),
  protocolo            char(6) NOT NULL,
  cidadao_id           uuid NOT NULL REFERENCES usuario(id),
  bairro_id            uuid NOT NULL REFERENCES bairro(id),
  ponto_coleta_id      uuid REFERENCES ponto_coleta(id),
  canal                canal_origem NOT NULL,
  faixa                faixa_risco NOT NULL,
  categoria            categoria_pedido NOT NULL,
  status               status_pedido NOT NULL,
  titulo               text NOT NULL,
  escalado             boolean NOT NULL DEFAULT false,
  desfecho             desfecho_pedido,
  criado_em            timestamptz NOT NULL DEFAULT now(),
  primeira_resposta_em timestamptz,
  fechado_em           timestamptz,
  UNIQUE (municipio_id, protocolo)
);
CREATE INDEX ON solicitacao (municipio_id, status, faixa);

-- Compartimento separado: o relato original (dado sensível) nunca é lido pelas rotas públicas.
CREATE TABLE relato (
  solicitacao_id uuid PRIMARY KEY REFERENCES solicitacao(id),
  texto          text NOT NULL
);

-- MD-02: classificação é append-only; reclassificar cria uma nova linha.
CREATE TABLE classificacao (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL REFERENCES solicitacao(id),
  faixa          faixa_risco NOT NULL,
  categoria      categoria_pedido NOT NULL,
  confianca      numeric(4,3),
  origem         origem_classif NOT NULL,
  regra          text,
  justificativa  text NOT NULL,
  autor_id       uuid REFERENCES usuario(id),
  duracao_ms     integer,
  criado_em      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE oferta (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL REFERENCES solicitacao(id),
  voluntario_id  uuid NOT NULL REFERENCES usuario(id),
  ativa          boolean NOT NULL DEFAULT true,
  criado_em      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX oferta_unica_ativa ON oferta (solicitacao_id) WHERE ativa;

CREATE TABLE entrega (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id  uuid NOT NULL REFERENCES solicitacao(id),
  ponto_coleta_id uuid NOT NULL REFERENCES ponto_coleta(id),
  origem          text NOT NULL CHECK (origem IN ('sensor', 'manual')),
  delta_peso_kg   numeric(8,2),
  criado_em       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE evento_iot (
  id              bigserial PRIMARY KEY,
  ponto_coleta_id uuid NOT NULL REFERENCES ponto_coleta(id),
  tipo            text NOT NULL CHECK (tipo IN ('leitura_sensor', 'entrega_depositada', 'retirada')),
  payload         jsonb NOT NULL,
  recebido_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON evento_iot (ponto_coleta_id, recebido_em DESC);

CREATE TABLE notificacao (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id     uuid NOT NULL REFERENCES usuario(id),
  solicitacao_id uuid REFERENCES solicitacao(id),
  tipo           text NOT NULL,
  texto          text NOT NULL,
  lida           boolean NOT NULL DEFAULT false,
  criado_em      timestamptz NOT NULL DEFAULT now()
);

-- MD-03: auditoria append-only, inclusive de leitura de dado sensível.
CREATE TABLE evento_auditoria (
  id         bigserial PRIMARY KEY,
  usuario_id uuid,
  acao       text NOT NULL,
  entidade   text NOT NULL,
  entidade_id text,
  detalhe    jsonb,
  criado_em  timestamptz NOT NULL DEFAULT now()
);
