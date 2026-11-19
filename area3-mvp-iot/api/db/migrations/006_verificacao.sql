-- Verificação da conta: e-mail confirmado (código por e-mail ou Google) e verificação em duas etapas por e-mail.
-- Com as duas, o usuário é "verificado".
ALTER TABLE usuario ADD COLUMN email_confirmado_em timestamptz;
ALTER TABLE usuario ADD COLUMN dois_fatores_em timestamptz;
