import { createHash } from 'node:crypto';

/** SHA-256 em hex. Usado para chaves de dispositivo IoT e códigos de acesso. */
export function sha256(valor: string): string {
  return createHash('sha256').update(valor).digest('hex');
}
