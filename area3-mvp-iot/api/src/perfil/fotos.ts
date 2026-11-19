/** Foto de perfil: validação do arquivo e o SQL do endereço público. */

export const FOTO_MAX_BYTES = 1_500_000;
/** Limite do corpo das requisições: a foto em base64 (+33%) com folga. */
export const LIMITE_CORPO = 2_500_000;

/** Tipo da imagem pelos primeiros bytes (não confia no que o cliente diz). */
export function tipoDaImagem(b: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** Endereço da foto (relativo à API) a partir do id da linha em foto_usuario. */
export const sqlUrlFoto = (coluna: string) => `CASE WHEN ${coluna} IS NULL THEN NULL ELSE '/fotos/' || ${coluna} END`;
