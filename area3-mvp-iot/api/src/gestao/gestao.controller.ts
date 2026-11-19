import { Controller, Get, Inject, Injectable, OnModuleDestroy, Query, UseGuards } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';
import { z } from 'zod';
import { AuthGuard, Perfis, SessaoAtual } from '../auth/auth.guard';
import { Sessao } from '../auth/sessao';
import { validar } from '../infra/validacao';

/**
 * Conexão do módulo Gestão: usa o papel somente leitura `elo_leitura_ouro` (DATABASE_URL_OURO),
 * que só enxerga a camada ouro. Mesmo um bug aqui não expõe dado pessoal.
 */
@Injectable()
export class PoolOuro implements OnModuleDestroy {
  readonly pool = new Pool({ connectionString: process.env.DATABASE_URL_OURO ?? process.env.DATABASE_URL, max: 5 });

  async onModuleDestroy() {
    await this.pool.end();
  }
}

const hoje = () => new Date().toISOString().slice(0, 10);
const diasAtras = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

const Filtros = z.object({
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  bairro: z.string().regex(/^[a-z0-9-]+$/).optional(),
  canal: z.enum(['app', 'whatsapp', 'balcao', 'web_leve']).optional(),
  categoria: z.enum(['alimento', 'roupa', 'movel', 'material_escolar', 'apoio_idoso', 'transporte', 'outro']).optional(),
  faixa: z.enum(['verde', 'amarela', 'vermelha']).optional(),
});

/** Metas do PRD (§14) devolvidas junto dos indicadores, para o painel comparar. */
const METAS = {
  taxa_absorcao: { valor: 0.5, sentido: 'minimo', texto: 'pelo menos 50% dos pedidos verdes resolvidos pela rede' },
  pct_escalado: { valor: 0.3, sentido: 'maximo', texto: 'no máximo 30% escalados por falta de voluntário' },
  pct_fora_do_app: { valor: 0.3, sentido: 'minimo', texto: 'pelo menos 30% dos pedidos fora do app' },
  pct_com_desfecho: { valor: 0.9, sentido: 'minimo', texto: 'pelo menos 90% com desfecho registrado' },
  voluntarios_por_200_hab: { valor: 1, sentido: 'minimo', texto: 'pelo menos 1 voluntário ativo por 200 habitantes' },
};

/** Painel do gestor (RF-601 a RF-606): só agregados da camada ouro. */
@Controller('gestao')
@UseGuards(AuthGuard)
@Perfis('gestor', 'tecnico')
export class GestaoController {
  constructor(@Inject(PoolOuro) private readonly ouro: PoolOuro) {}

  private async q<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]> {
    return (await this.ouro.pool.query(sql, params)).rows as T[];
  }

  @Get('indicadores')
  async indicadores(@SessaoAtual() s: Sessao, @Query() query: unknown) {
    const f = validar(Filtros, query);
    const [linha] = await this.q(
      'SELECT * FROM ouro.indicadores($1, $2, $3, $4, $5, $6, $7)',
      [f.inicio ?? diasAtras(180), f.fim ?? hoje(), s.municipioId, f.bairro ?? null, f.canal ?? null, f.categoria ?? null, f.faixa ?? null],
    );
    const [densidade] = await this.q<{ v: string }>(
      `SELECT round(sum(voluntarios_ativos) * 200.0 / NULLIF(sum(populacao), 0), 2) AS v
       FROM ouro.v_densidade_rede WHERE municipio_id::text = $1 AND ($2::text IS NULL OR slug = $2)`,
      [s.municipioId, f.bairro ?? null],
    );
    return { filtros: f, indicadores: { ...linha, voluntarios_por_200_hab: densidade?.v ?? null }, metas: METAS };
  }

  @Get('mensal')
  mensal(@SessaoAtual() s: Sessao) {
    return this.q('SELECT mes, total, variacao_abs, variacao_pct FROM ouro.v_pedidos_mensal WHERE municipio_id::text = $1 ORDER BY mes', [s.municipioId]);
  }

  @Get('canais')
  async canais(@SessaoAtual() s: Sessao, @Query() query: unknown) {
    const f = validar(Filtros, query);
    return this.q(
      `SELECT semana, canal, total FROM ouro.v_canal_semanal
       WHERE municipio_id::text = $1 AND semana BETWEEN $2 AND $3 ORDER BY semana, canal`,
      [s.municipioId, f.inicio ?? diasAtras(180), f.fim ?? hoje()],
    );
  }

  @Get('categorias')
  async categorias(@SessaoAtual() s: Sessao, @Query() query: unknown) {
    const f = validar(Filtros, query);
    return this.q(
      `SELECT f.categoria, f.faixa, count(*)::int AS total FROM ouro.fato_solicitacao f
       JOIN ouro.dim_bairro b ON b.bairro_id = f.bairro_id
       WHERE f.municipio_id::text = $1 AND f.data_abertura BETWEEN $2 AND $3
         AND ($4::text IS NULL OR b.slug = $4) AND ($5::text IS NULL OR f.canal = $5)
       GROUP BY 1, 2 ORDER BY total DESC`,
      [s.municipioId, f.inicio ?? diasAtras(180), f.fim ?? hoje(), f.bairro ?? null, f.canal ?? null],
    );
  }

  @Get('territorio')
  territorio(@SessaoAtual() s: Sessao) {
    return this.q(
      `SELECT bairro, slug, populacao, pedidos, pedidos_por_mil_hab, pct_escalado, taxa_absorcao,
              voluntarios_ativos, voluntarios_por_200_hab, ranking_escalonamento
       FROM ouro.v_territorio WHERE municipio_id::text = $1 ORDER BY ranking_escalonamento`,
      [s.municipioId],
    );
  }

  @Get('pontos')
  async pontos(@SessaoAtual() s: Sessao) {
    const previsao = await this.q(
      `SELECT ponto_coleta_id, ponto, capacidade_kg, estoque_kg, temperatura_c, consumo_medio_7d_kg, dias_ate_zerar, ocupacao_pct
       FROM ouro.v_previsao_estoque WHERE municipio_id::text = $1 ORDER BY dias_ate_zerar NULLS LAST`,
      [s.municipioId],
    );
    const alertas = await this.q(
      `SELECT a.ponto_coleta_id, count(*)::int AS dias_com_alerta, max(a.temperatura_max_c) AS temperatura_max_c
       FROM ouro.v_alertas_temperatura a JOIN ouro.dim_ponto_coleta p USING (ponto_coleta_id)
       WHERE p.municipio_id::text = $1 GROUP BY 1`,
      [s.municipioId],
    );
    const entregas = await this.q('SELECT origem, entregas, horas_ate_deposito FROM ouro.v_entregas WHERE municipio_id::text = $1', [s.municipioId]);
    return { previsao, alertas, entregas };
  }

  /** Aba "Qualidade da IA": resultados da avaliação da triagem + origem das decisões em produção. */
  @Get('ia')
  async ia(@SessaoAtual() s: Sessao) {
    const pasta = [join(process.cwd(), '../../area1-ia/triagem/avaliacao'), join(__dirname, '../../../../../area1-ia/triagem/avaliacao')].find(existsSync);
    const ler = (arquivo: string) => {
      if (!pasta || !existsSync(join(pasta, arquivo))) return null;
      const r = JSON.parse(readFileSync(join(pasta, arquivo), 'utf8'));
      return {
        modelo: r.modelo, versao_lexico: r.versao_lexico, versao_prompt: r.versao_prompt ?? null, total: r.total,
        acuracia: r.acuracia, recall_vermelha: r.recall_vermelha, precisao_vermelha: r.precisao_vermelha,
        falsos_negativos_vermelha: r.falsos_negativos_vermelha, tempo_medio_ms: r.tempo_medio_ms, matriz_confusao: r.matriz_confusao,
      };
    };
    const producao = await this.q('SELECT origem_triagem, faixa, total, ms_medio FROM ouro.v_triagem WHERE municipio_id::text = $1', [s.municipioId]);
    return {
      avaliacoes: {
        treino_offline: ler('resultado.json'),
        validacao_offline: ler('resultado-validacao.json'),
        treino_llm: ler('resultado-llm.json'),
        validacao_llm: ler('resultado-validacao-llm.json'),
        treino_v1: ler('resultado-v1.json'),
      },
      producao,
    };
  }

  /** Exportação para prestação de contas (RF-606): indicadores por bairro em CSV. */
  @Get('exportar.csv')
  async exportar(@SessaoAtual() s: Sessao) {
    const linhas = await this.territorio(s);
    const cab = ['bairro', 'populacao', 'pedidos', 'pedidos_por_mil_hab', 'pct_escalado', 'taxa_absorcao', 'voluntarios_ativos', 'voluntarios_por_200_hab'];
    const csv = [cab.join(';'), ...linhas.map((l) => cab.map((c) => String((l as Record<string, unknown>)[c] ?? '')).join(';'))].join('\n');
    return csv;
  }
}
