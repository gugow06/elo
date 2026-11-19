import { normalizar } from './normalizar';
import { Categoria, ClassificadorModelo, Faixa, RespostaModelo } from './tipos';

/**
 * Classificador offline por palavras-chave. Usado quando não há LLM configurado
 * (demonstração sem internet, CI). É conservador: sem sinal claro, a confiança
 * fica baixa e a triagem escala para o técnico.
 */
const SINAIS: Array<{ categoria: Categoria; faixa: Faixa; termos: RegExp }> = [
  {
    categoria: 'alimento',
    faixa: 'verde',
    termos: /\b(cesta( basica)?|comida|alimentos?|arroz|feijao|leite|oleo|mantimentos?|mercado|fraldas?|acucar|cafe|macarrao)\b/g,
  },
  {
    categoria: 'roupa',
    faixa: 'verde',
    termos: /\b(roupas?|agasalhos?|casacos?|blusas?|calcas?|sapatos?|tenis|chinelos?|cobertor(es)?|mantas?)\b/g,
  },
  {
    categoria: 'movel',
    faixa: 'verde',
    termos: /\b(colchao|colchoes|cama|berco|sofa|armario|guarda.roupa|geladeira|fogao|mesa|cadeiras?|maquina de lavar|moveis|movel)\b/g,
  },
  {
    categoria: 'material_escolar',
    faixa: 'verde',
    termos: /\b(material escolar|cadernos?|mochilas?|lapis|canetas?|estojo|livros?|uniforme escolar|escola)\b/g,
  },
  {
    categoria: 'apoio_idoso',
    faixa: 'amarela',
    termos: /\b(idos[oa]s?|vo|avo|vovo|ficar com (ela|ele)|companhia|moro sozinh[oa]|sozinh[oa] em casa|carregar|botijao|cuidador(a)?|aposentad[oa])\b/g,
  },
  {
    categoria: 'transporte',
    faixa: 'amarela',
    termos: /\b(carona|consulta|hospital|exame|levar (ao|no|na|para)|transporte|cadeira de rodas|fisioterapia)\b/g,
  },
];

export class ClassificadorOffline implements ClassificadorModelo {
  readonly nome = 'offline-palavras-chave';
  readonly externo = false;

  async classificar(relato: string): Promise<RespostaModelo> {
    const texto = normalizar(relato);
    const pontos = SINAIS.map((s) => ({ ...s, acertos: texto.match(s.termos)?.length ?? 0 })).filter((s) => s.acertos > 0);

    if (pontos.length === 0) {
      return { faixa: 'amarela', categoria: 'outro', confianca: 0.3, justificativa: 'Nenhum sinal claro de necessidade material.' };
    }

    // Sinal de pessoa frágil (amarela) prevalece sobre a necessidade material.
    pontos.sort((a, b) => (a.faixa === b.faixa ? b.acertos - a.acertos : a.faixa === 'amarela' ? -1 : 1));
    const melhor = pontos[0];
    const ambiguo = pontos.length > 1 && pontos[1].faixa !== melhor.faixa;
    const confianca = Math.min(0.95, 0.7 + 0.1 * melhor.acertos) - (ambiguo ? 0.1 : 0);

    return {
      faixa: melhor.faixa,
      categoria: melhor.categoria,
      confianca: Number(confianca.toFixed(2)),
      justificativa: `Sinais de ${melhor.categoria.replace('_', ' ')} no relato.`,
    };
  }
}
