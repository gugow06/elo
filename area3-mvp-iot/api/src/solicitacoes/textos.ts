import type { Categoria } from '@elo/triagem';

/** Título público do pedido. Nunca usa o relato: é gerado só a partir da categoria. */
export const TITULO_POR_CATEGORIA: Record<Categoria, string> = {
  alimento: 'Família precisa de alimentos',
  roupa: 'Família precisa de roupas',
  movel: 'Família precisa de um móvel',
  material_escolar: 'Criança precisa de material escolar',
  apoio_idoso: 'Pessoa idosa precisa de apoio',
  transporte: 'Precisa de transporte',
  outro: 'Pedido de ajuda',
};

/**
 * Status em linguagem simples para o cidadão (RF-206).
 * RT-05: o cidadão nunca vê a faixa de risco; amarela e vermelha aparecem iguais.
 */
export const STATUS_PARA_CIDADAO: Record<string, string> = {
  recebida: 'Recebemos o seu pedido',
  no_mural: 'Aguardando um voluntário do seu bairro',
  em_atendimento: 'Um voluntário vai ajudar você',
  na_fila_tecnica: 'A equipe do CRAS está cuidando do seu pedido',
  entregue: 'Sua doação chegou ao ponto de coleta. Pode retirar.',
  concluida: 'Pedido concluído',
  cancelada: 'Pedido cancelado',
};

export function mensagemDeRecebimento(protocolo: string, pontoNome?: string | null): string {
  const base = `Recebemos o seu pedido. Seu protocolo é ${protocolo.split('').join(' ')}. Guarde este número.`;
  return pontoNome ? `${base} Quando a doação chegar, você poderá retirar no ${pontoNome}.` : `${base} A equipe entrará em contato.`;
}
