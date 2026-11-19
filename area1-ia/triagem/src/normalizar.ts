/**
 * Normaliza o relato para a aplicação das regras: minúsculas, sem acentos,
 * abreviações comuns de mensagem expandidas e espaços colapsados.
 */
const ABREVIACOES: Array<[RegExp, string]> = [
  [/\bvc\b/g, 'voce'],
  [/\bvcs\b/g, 'voces'],
  [/\bq\b/g, 'que'],
  [/\bpq\b/g, 'porque'],
  [/\bn\b/g, 'nao'],
  [/\bnao\s+tem\s+nada\s+pra\s+comer\b/g, 'sem comer'],
  [/\bto\b/g, 'estou'],
  [/\bta\b/g, 'esta'],
  [/\btb\b/g, 'tambem'],
  [/\bmto\b/g, 'muito'],
  [/\bhj\b/g, 'hoje'],
];

export function normalizar(texto: string): string {
  let t = texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s.,;:!?-]/g, ' ');
  for (const [padrao, troca] of ABREVIACOES) t = t.replace(padrao, troca);
  return t.replace(/\s+/g, ' ').trim();
}
