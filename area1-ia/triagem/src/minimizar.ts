/**
 * Remove dados pessoais do relato antes de enviá-lo a qualquer modelo externo
 * (minimização, LGPD). O relato original fica só no banco, em tabela separada.
 */
const SUBSTITUICOES: Array<[RegExp, string]> = [
  [/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF]'],
  [/[\w.+-]+@[\w-]+\.[\w.]+/g, '[EMAIL]'],
  [/(\+?55\s?)?(\(?\d{2}\)?\s?)?9?\d{4}[-\s]?\d{4}\b/g, '[TELEFONE]'],
  [/\b(rua|r\.|avenida|av\.?|travessa|tv\.|alameda|estrada|rodovia)\s+[^,.;\n]{2,60}[,\s]+(n[º°o.]?\s*)?\d{1,5}\b/gi, '[ENDERECO]'],
  // Nome próprio depois de "meu nome é" / "me chamo": palavras com inicial maiúscula.
  [/\b([Mm]eu nome (?:é|e)|[Mm]e chamo)\s+[A-ZÀ-Ú][a-zà-ú]+(?:\s+(?:d[aeo]s?\s+)?[A-ZÀ-Ú][a-zà-ú]+){0,3}/g, '$1 [NOME]'],
];

export function minimizar(relato: string): string {
  let t = relato;
  for (const [padrao, troca] of SUBSTITUICOES) t = t.replace(padrao, troca);
  return t;
}
