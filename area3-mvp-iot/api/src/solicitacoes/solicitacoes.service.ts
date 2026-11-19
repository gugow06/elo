import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Classificacao, ClassificadorModelo, triar } from '@elo/triagem';
import { randomInt } from 'node:crypto';
import { gerarItens, sqlItens } from '../rede/itens';
import { Pool, PoolClient } from 'pg';
import { auditar } from '../infra/auditoria';
import { POOL } from '../infra/banco.module';
import { Sessao } from '../auth/sessao';
import { EventosService } from '../infra/eventos.service';
import { CLASSIFICADOR } from './classificador.provider';
import { mensagemDeRecebimento, STATUS_PARA_CIDADAO, TITULO_POR_CATEGORIA } from './textos';

export interface NovaSolicitacao {
  relato: string;
  canal: 'app' | 'whatsapp' | 'balcao' | 'web_leve';
  bairroId?: string;
}

@Injectable()
export class SolicitacoesService {
  constructor(
    @Inject(POOL) private readonly pool: Pool,
    @Inject(CLASSIFICADOR) private readonly classificador: ClassificadorModelo,
    @Inject(EventosService) private readonly eventos: EventosService,
  ) {}

  private limiar(): number {
    return Number(process.env.LLM_LIMIAR_CONFIANCA ?? 0.75);
  }

  /** Abre a solicitação: triagem ANTES de qualquer visibilidade (PRD §8). */
  async abrir(sessao: Sessao, dados: NovaSolicitacao) {
    const classificacao = await triar(dados.relato, { modelo: this.classificador, limiarConfianca: this.limiar() });
    const cliente = await this.pool.connect();
    try {
      await cliente.query('BEGIN');
      const bairroId = dados.bairroId ?? sessao.bairroId;
      const bairro = await cliente.query<{ id: string }>('SELECT id FROM bairro WHERE id = $1 AND municipio_id = $2', [bairroId, sessao.municipioId]);
      if (!bairro.rows[0]) throw new NotFoundException('Bairro não encontrado no seu município.');

      const ponto = classificacao.faixa === 'verde' ? await this.sugerirPonto(cliente, sessao.municipioId, bairroId!) : null;
      const status = classificacao.faixa === 'verde' ? 'no_mural' : 'na_fila_tecnica';
      const protocolo = await this.novoProtocolo(cliente, sessao.municipioId);

      const { rows } = await cliente.query<{ id: string }>(
        `INSERT INTO solicitacao (municipio_id, protocolo, cidadao_id, bairro_id, ponto_coleta_id, canal, faixa, categoria, status, titulo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [sessao.municipioId, protocolo, sessao.usuarioId, bairroId, ponto?.id ?? null, dados.canal, classificacao.faixa,
          classificacao.categoria, status, TITULO_POR_CATEGORIA[classificacao.categoria]],
      );
      const id = rows[0].id;
      await cliente.query('INSERT INTO relato (solicitacao_id, texto) VALUES ($1,$2)', [id, dados.relato]);
      await gerarItens(cliente, id, classificacao.categoria, TITULO_POR_CATEGORIA[classificacao.categoria]);
      await this.registrarClassificacao(cliente, id, classificacao);
      await auditar(cliente, { usuarioId: sessao.usuarioId, acao: 'abrir_solicitacao', entidade: 'solicitacao', entidadeId: id, detalhe: { canal: dados.canal } });

      if (classificacao.faixa === 'vermelha') {
        await this.alertarTecnicos(cliente, sessao.municipioId, id, protocolo);
      }
      await cliente.query('COMMIT');

      if (classificacao.faixa === 'vermelha') {
        this.eventos.emitir({ tipo: 'alerta_vermelho', municipioId: sessao.municipioId, solicitacaoId: id, protocolo });
      }
      this.eventos.emitir({ tipo: 'solicitacao_criada', municipioId: sessao.municipioId, solicitacaoId: id, protocolo });

      // RT-05: a resposta ao cidadão nunca inclui a faixa de risco.
      return {
        id,
        protocolo,
        status: STATUS_PARA_CIDADAO[status],
        mensagem: mensagemDeRecebimento(protocolo, ponto?.nome),
        ponto_coleta: ponto ? { nome: ponto.nome, endereco: ponto.endereco } : null,
      };
    } catch (erro) {
      await cliente.query('ROLLBACK');
      throw erro;
    } finally {
      cliente.release();
    }
  }

  async registrarClassificacao(db: PoolClient | Pool, solicitacaoId: string, c: Classificacao, autorId?: string) {
    await db.query(
      `INSERT INTO classificacao (solicitacao_id, faixa, categoria, confianca, origem, regra, justificativa, autor_id, duracao_ms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [solicitacaoId, c.faixa, c.categoria, c.confianca, c.origem, c.regra ?? null, c.justificativa, autorId ?? null, c.duracaoMs],
    );
  }

  /** Ponto de coleta do próprio bairro; se não houver, o do município com mais espaço livre. */
  private async sugerirPonto(db: PoolClient, municipioId: string, bairroId: string) {
    const { rows } = await db.query<{ id: string; nome: string; endereco: string }>(
      `SELECT id, nome, endereco FROM ponto_coleta
       WHERE municipio_id = $1
       ORDER BY (bairro_id = $2) DESC, (capacidade_kg - estoque_kg) DESC
       LIMIT 1`,
      [municipioId, bairroId],
    );
    return rows[0] ?? null;
  }

  /** Protocolo de 6 dígitos, falável e anotável (RC-02), único por município. */
  private async novoProtocolo(db: PoolClient, municipioId: string): Promise<string> {
    for (let tentativa = 0; tentativa < 20; tentativa++) {
      const p = String(randomInt(100000, 1000000));
      const existe = await db.query('SELECT 1 FROM solicitacao WHERE municipio_id = $1 AND protocolo = $2', [municipioId, p]);
      if (!existe.rowCount) return p;
    }
    throw new Error('Não foi possível gerar protocolo único');
  }

  private async alertarTecnicos(db: PoolClient, municipioId: string, solicitacaoId: string, protocolo: string) {
    await db.query(
      `INSERT INTO notificacao (usuario_id, solicitacao_id, tipo, texto)
       SELECT id, $2, 'alerta_vermelho', $3 FROM usuario WHERE municipio_id = $1 AND perfil = 'tecnico'`,
      [municipioId, solicitacaoId, `ALERTA: pedido ${protocolo} com indício de risco. Atender com prioridade.`],
    );
  }

  /** Pedidos do próprio cidadão, com status em linguagem simples (sem faixa). */
  async minhas(sessao: Sessao) {
    const { rows } = await this.pool.query(
      `SELECT s.id, s.protocolo, s.titulo, s.categoria, s.status, s.criado_em, p.nome AS ponto_coleta, ${sqlItens('$1')}
       FROM solicitacao s LEFT JOIN ponto_coleta p ON p.id = s.ponto_coleta_id
       WHERE s.cidadao_id = $1 ORDER BY s.criado_em DESC`,
      [sessao.usuarioId],
    );
    return rows.map((r) => ({ ...r, status_texto: STATUS_PARA_CIDADAO[r.status] }));
  }

  /** Consulta de status sem login: protocolo + data de nascimento (RC-03 / RF-106). */
  async consultarPorProtocolo(protocolo: string, nascimento: string) {
    const { rows } = await this.pool.query(
      `SELECT s.protocolo, s.titulo, s.status, s.criado_em, s.fechado_em, p.nome AS ponto_coleta
       FROM solicitacao s
       JOIN usuario u ON u.id = s.cidadao_id
       LEFT JOIN ponto_coleta p ON p.id = s.ponto_coleta_id
       WHERE s.protocolo = $1 AND u.data_nascimento = $2`,
      [protocolo, nascimento],
    );
    if (!rows[0]) throw new NotFoundException('Não encontramos um pedido com esse protocolo e data de nascimento.');
    return { ...rows[0], status_texto: STATUS_PARA_CIDADAO[rows[0].status] };
  }
}
