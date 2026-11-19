import { createRemoteJWKSet, JWTVerifyGetKey, jwtVerify } from 'jose';

/**
 * Verificação do ID token do "Fazer login com o Google".
 * O app (google_sign_in) obtém o token com o Web Client ID como serverClientId; a API confere
 * assinatura (chaves públicas do Google), emissor, audiência (GOOGLE_CLIENT_IDS) e validade.
 */
let chaves: JWTVerifyGetKey | null = null;

/** Só para testes: troca as chaves públicas do Google por outras. */
export function definirChavesGoogle(c: JWTVerifyGetKey | null): void {
  chaves = c;
}

export interface IdentidadeGoogle {
  sujeito: string;
  email: string;
  nome: string | null;
}

export class GoogleNaoConfigurado extends Error {}

export function clientesGoogle(): string[] {
  return (process.env.GOOGLE_CLIENT_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

export async function verificarTokenGoogle(idToken: string): Promise<IdentidadeGoogle> {
  const audiencia = clientesGoogle();
  if (!audiencia.length) throw new GoogleNaoConfigurado('GOOGLE_CLIENT_IDS não configurado.');
  chaves ??= createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
  const { payload } = await jwtVerify(idToken, chaves, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: audiencia,
  });
  if (!payload.sub || typeof payload.email !== 'string' || payload.email_verified !== true) {
    throw new Error('Conta Google sem e-mail verificado.');
  }
  return { sujeito: payload.sub, email: payload.email.toLowerCase(), nome: typeof payload.name === 'string' ? payload.name : null };
}
