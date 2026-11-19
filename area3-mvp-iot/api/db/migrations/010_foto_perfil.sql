-- Foto de perfil (F7-D5: todos veem; F7-D8: guardada no próprio Postgres enquanto a hospedagem é local).
-- O id muda a cada envio: o endereço /fotos/{id} pode ficar em cache para sempre.
CREATE TABLE foto_usuario (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL UNIQUE REFERENCES usuario(id) ON DELETE CASCADE,
  tipo       text NOT NULL CHECK (tipo IN ('image/jpeg', 'image/png', 'image/webp')),
  dados      bytea NOT NULL,
  criada_em  timestamptz NOT NULL DEFAULT now()
);
