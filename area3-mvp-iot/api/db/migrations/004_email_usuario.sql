-- Login por e-mail: o código de acesso vai para o e-mail (Resend). O telefone fica como contato.
ALTER TABLE usuario ADD COLUMN email text;
CREATE UNIQUE INDEX usuario_email_unico ON usuario (lower(email));
