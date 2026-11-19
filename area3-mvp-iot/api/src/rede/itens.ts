import { Pool, PoolClient } from 'pg';
import { sqlUrlFoto } from '../perfil/fotos';

/** Itens sugeridos pela categoria da triagem. Categorias "inteiras" viram um item só (o título). */
export const ITENS_POR_CATEGORIA: Record<string, string[]> = {
  alimento: ['Arroz', 'Feijão', 'Óleo', 'Leite', 'Itens de higiene básica'],
  roupa: ['Agasalhos', 'Calças', 'Cobertores', 'Calçados'],
  movel: ['Móvel em bom estado', 'Transporte até o ponto de coleta'],
  material_escolar: ['Cadernos', 'Lápis e canetas', 'Mochila', 'Estojo'],
};

/** Móvel: um ajudante leva tudo (decisão D3). Nas outras, cada um escolhe itens. */
export const CATEGORIAS_INTEIRAS = new Set(['movel']);

export async function gerarItens(db: Pool | PoolClient, solicitacaoId: string, categoria: string, titulo: string): Promise<void> {
  const itens = ITENS_POR_CATEGORIA[categoria] ?? [titulo];
  await db.query(
    `INSERT INTO item_solicitacao (solicitacao_id, descricao, ordem)
     SELECT $1, d, o FROM unnest($2::text[]) WITH ORDINALITY AS t(d, o)`,
    [solicitacaoId, itens],
  );
}

/**
 * Itens do pedido com a situação de cada um, sem dizer quem leva:
 * aberto (ninguém leva), comprometido (alguém vai levar), entregue (chegou ao ponto de coleta;
 * `quantidade` = quanto chegou), obtido (quem pediu já recebeu).
 * `meu` = este usuário está levando o item.
 * `ajudantes` = primeiro nome e foto de quem está ajudando (até 5; o total vem em `pessoas_ajudando`).
 * Decisão F7-D5: a foto de perfil é pública e o pedido mostra quem ajuda.
 */
export const SQL_ITENS = `
  coalesce((
    SELECT json_agg(json_build_object(
      'id', i.id, 'descricao', i.descricao,
      'status', CASE WHEN i.obtido_em IS NOT NULL THEN 'obtido'
                     WHEN i.entregue_em IS NOT NULL THEN 'entregue'
                     WHEN EXISTS (SELECT 1 FROM oferta_item oi JOIN oferta o ON o.id = oi.oferta_id WHERE oi.item_id = i.id AND o.ativa) THEN 'comprometido'
                     ELSE 'aberto' END,
      'quantidade', i.quantidade_entregue,
      'meu', EXISTS (SELECT 1 FROM oferta_item oi JOIN oferta o ON o.id = oi.oferta_id WHERE oi.item_id = i.id AND o.ativa AND o.voluntario_id = $USUARIO)
    ) ORDER BY i.ordem)
    FROM item_solicitacao i WHERE i.solicitacao_id = s.id
  ), '[]'::json) AS itens,
  (SELECT count(*)::int FROM oferta o WHERE o.solicitacao_id = s.id AND o.ativa) AS pessoas_ajudando,
  coalesce((
    SELECT json_agg(json_build_object('nome', a.nome, 'foto', a.foto) ORDER BY a.criado_em)
    FROM (
      SELECT split_part(u.nome, ' ', 1) AS nome, ${sqlUrlFoto('f.id')} AS foto, o.criado_em
      FROM oferta o JOIN usuario u ON u.id = o.voluntario_id LEFT JOIN foto_usuario f ON f.usuario_id = u.id
      WHERE o.solicitacao_id = s.id AND o.ativa
      ORDER BY o.criado_em LIMIT 5
    ) a
  ), '[]'::json) AS ajudantes`;

/**
 * Pedido visível para quem quer ajudar (mural, "perto de você" e mapa): do momento em que entra no
 * mural até quem pediu encerrar (concluir ou cancelar). Continua visível mesmo com todos os itens
 * com alguém levando: quem vê sabe que o pedido existe e quantas pessoas já ajudam.
 */
export const SQL_VISIVEL = `s.status IN ('no_mural', 'em_atendimento', 'entregue') AND s.faixa = 'verde'`;

/** SQL_ITENS com o parâmetro do usuário no lugar de $USUARIO. */
export const sqlItens = (parametroUsuario: string) => SQL_ITENS.replaceAll('$USUARIO', parametroUsuario);
