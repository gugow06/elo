import { jwtVerify, SignJWT } from 'jose';

export type Perfil = 'cidadao' | 'voluntario' | 'tecnico' | 'gestor';

export interface Sessao {
  usuarioId: string;
  perfil: Perfil;
  municipioId: string;
  bairroId: string | null;
  nome: string;
}

function segredo(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw new Error('JWT_SECRET ausente ou curto demais (mínimo 16 caracteres).');
  return new TextEncoder().encode(s);
}

export async function emitirToken(s: Sessao): Promise<string> {
  return new SignJWT({ perfil: s.perfil, mun: s.municipioId, bai: s.bairroId, nome: s.nome })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(s.usuarioId)
    .setIssuedAt()
    .setExpirationTime('8h')
    .setIssuer('elo-api')
    .sign(segredo());
}

export async function lerToken(token: string): Promise<Sessao> {
  const { payload } = await jwtVerify(token, segredo(), { issuer: 'elo-api', algorithms: ['HS256'] });
  // O desafio da verificação em duas etapas usa o mesmo segredo, mas nunca vale como sessão
  if (payload.aud !== undefined || payload.fin !== undefined || !payload.perfil) throw new Error('Token não é de sessão.');
  return {
    usuarioId: String(payload.sub),
    perfil: payload.perfil as Perfil,
    municipioId: String(payload.mun),
    bairroId: (payload.bai as string | null) ?? null,
    nome: String(payload.nome ?? ''),
  };
}

/**
 * Desafio da verificação em duas etapas: prova curta (10 min) de que o primeiro passo
 * (Google) deu certo. Só serve para trocar pelo código do e-mail em /auth/social/confirmar.
 */
export async function emitirDesafio(usuarioId: string): Promise<string> {
  return new SignJWT({ fin: '2fa' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(usuarioId)
    .setIssuedAt()
    .setExpirationTime('10m')
    .setIssuer('elo-api')
    .setAudience('elo-2fa')
    .sign(segredo());
}

export async function lerDesafio(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, segredo(), { issuer: 'elo-api', audience: 'elo-2fa', algorithms: ['HS256'] });
  if (payload.fin !== '2fa' || !payload.sub) throw new Error('Desafio inválido.');
  return payload.sub;
}
