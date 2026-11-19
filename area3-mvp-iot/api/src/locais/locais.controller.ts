import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { AuthGuard, Perfis, SessaoAtual } from '../auth/auth.guard';
import { Sessao } from '../auth/sessao';
import { auditar } from '../infra/auditoria';
import { POOL } from '../infra/banco.module';
import { sha256 } from '../infra/hash';
import { validar } from '../infra/validacao';

export const TIPOS_LOCAL = ['ponto_coleta', 'assistencia', 'abrigo', 'distribuicao', 'saude'] as const;
const CATEGORIAS = ['alimento', 'roupa', 'movel', 'material_escolar', 'apoio_idoso', 'transporte', 'outro'] as const;

const opcional = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
// Coordenadas dentro do território brasileiro (caixa aproximada)
const latitude = z.coerce.number().min(-34).max(5.5);
const longitude = z.coerce.number().min(-74).max(-34.5);

const CamposLocal = z.object({
  tipo: z.enum(TIPOS_LOCAL),
  nome: z.string().trim().min(3, 'Informe o nome do local').max(120),
  endereco: z.string().trim().min(5, 'Informe o endereço').max(250),
  latitude,
  longitude,
  bairro_id: z.string().uuid().nullish(),
  telefone: opcional(40),
  horario: opcional(120),
  descricao: opcional(500),
  categorias: z.array(z.enum(CATEGORIAS)).max(7).default([]),
  vagas: z.coerce.number().int().min(0).max(100000).nullish(),
  capacidade_kg: z.coerce.number().positive().max(100000).nullish(),
});
const EdicaoLocal = CamposLocal.omit({ tipo: true }).partial().extend({ ativo: z.boolean().optional() });

const Caixa = z.object({
  bbox: z
    .string()
    .transform((s) => s.split(',').map(Number))
    .pipe(z.tuple([z.number().min(-75).max(-30), z.number().min(-35).max(6), z.number().min(-75).max(-30), z.number().min(-35).max(6)])),
  tipo: z.enum(TIPOS_LOCAL).optional(),
});

const COLUNAS = `l.id, l.tipo, l.nome, l.endereco, l.latitude::float AS latitude, l.longitude::float AS longitude,
  l.telefone, l.horario, l.descricao, l.categorias::text[] AS categorias, l.vagas, l.ativo, l.bairro_id, b.nome AS bairro,
  p.capacidade_kg::float AS capacidade_kg, p.estoque_kg::float AS estoque_kg, (p.id IS NOT NULL) AS tem_sensor,
  l.atualizado_em`;

/**
 * Locais da rede: o gestor cadastra pelo nome ou pelo endereço (busca em /geo/buscar), confirma o
 * ponto e o local aparece no mapa do app. Desativar em vez de apagar; toda alteração é auditada.
 */
@Controller()
@UseGuards(AuthGuard)
export class LocaisController {
  constructor(@Inject(POOL) private readonly pool: Pool) {}

  @Get('gestao/locais')
  @Perfis('gestor', 'tecnico')
  async listar(@SessaoAtual() sessao: Sessao) {
    const { rows } = await this.pool.query(
      `SELECT ${COLUNAS}
       FROM local_rede l
       LEFT JOIN bairro b ON b.id = l.bairro_id
       LEFT JOIN ponto_coleta p ON p.id = l.ponto_coleta_id
       WHERE l.municipio_id = $1
       ORDER BY l.ativo DESC, l.tipo, l.nome`,
      [sessao.municipioId],
    );
    return rows;
  }

  @Post('gestao/locais')
  @Perfis('gestor')
  async criar(@SessaoAtual() sessao: Sessao, @Body() corpo: unknown) {
    const d = validar(CamposLocal, corpo);
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      await this.conferirBairro(c, sessao, d.bairro_id);
      let pontoId: string | null = null;
      let chave: string | null = null;
      if (d.tipo === 'ponto_coleta') {
        // Ponto de coleta recebe as doações dos pedidos: precisa de bairro e ganha a chave do sensor
        if (!d.bairro_id) throw new BadRequestException('Ponto de coleta precisa de bairro.');
        chave = randomBytes(18).toString('base64url');
        pontoId = (await c.query<{ id: string }>(
          `INSERT INTO ponto_coleta (municipio_id, bairro_id, nome, endereco, capacidade_kg, estoque_kg, device_key_hash)
           VALUES ($1,$2,$3,$4,$5,0,$6) RETURNING id`,
          [sessao.municipioId, d.bairro_id, d.nome, d.endereco, d.capacidade_kg ?? 200, sha256(chave)],
        )).rows[0].id;
      }
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO local_rede (municipio_id, bairro_id, tipo, nome, endereco, latitude, longitude, telefone, horario,
                                 descricao, categorias, vagas, ponto_coleta_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [sessao.municipioId, d.bairro_id ?? null, d.tipo, d.nome, d.endereco, d.latitude, d.longitude, d.telefone, d.horario,
         d.descricao, d.categorias, d.tipo === 'abrigo' ? (d.vagas ?? null) : null, pontoId],
      );
      await auditar(c, { usuarioId: sessao.usuarioId, acao: 'criar_local', entidade: 'local_rede', entidadeId: rows[0].id, detalhe: { tipo: d.tipo } });
      await c.query('COMMIT');
      const local = await this.buscar(sessao, rows[0].id);
      // A chave do sensor só aparece agora: o banco guarda apenas o hash
      return pontoId ? { ...local, ponto_coleta_id: pontoId, chave_dispositivo: chave } : local;
    } catch (erro) {
      await c.query('ROLLBACK');
      throw erro;
    } finally {
      c.release();
    }
  }

  @Patch('gestao/locais/:id')
  @Perfis('gestor')
  async editar(@SessaoAtual() sessao: Sessao, @Param('id') id: string, @Body() corpo: unknown) {
    const d = validar(EdicaoLocal, corpo);
    const atual = await this.buscar(sessao, id);
    await this.conferirBairro(this.pool, sessao, d.bairro_id);
    const { capacidade_kg: capacidade, ...resto } = d;
    const campos: Record<string, unknown> = { ...resto };
    if (atual.tipo !== 'abrigo') delete campos.vagas;
    const nomes = Object.keys(campos).filter((k) => campos[k] !== undefined);
    if (nomes.length) {
      await this.pool.query(
        `UPDATE local_rede SET ${nomes.map((k, i) => `${k} = $${i + 3}`).join(', ')}, atualizado_em = now()
         WHERE id = $1 AND municipio_id = $2`,
        [id, sessao.municipioId, ...nomes.map((k) => campos[k])],
      );
    }
    // Mantém o ponto de coleta (usado pelo sensor e pelos pedidos) em sincronia
    await this.pool.query(
      `UPDATE ponto_coleta p SET nome = l.nome, endereco = l.endereco, capacidade_kg = coalesce($2, p.capacidade_kg)
       FROM local_rede l WHERE l.id = $1 AND p.id = l.ponto_coleta_id`,
      [id, capacidade ?? null],
    );
    await auditar(this.pool, { usuarioId: sessao.usuarioId, acao: 'editar_local', entidade: 'local_rede', entidadeId: id, detalhe: { campos: nomes } });
    return this.buscar(sessao, id);
  }

  /** Locais ativos dentro da área do mapa, de qualquer município (dados públicos). */
  @Get('mapa/locais')
  async mapa(@Query() query: unknown) {
    const { bbox: [oeste, sul, leste, norte], tipo } = validar(Caixa, query);
    const { rows } = await this.pool.query(
      `SELECT l.id, l.tipo, l.nome, l.endereco, l.latitude::float AS latitude, l.longitude::float AS longitude,
              l.telefone, l.horario, l.descricao, l.categorias::text[] AS categorias, l.vagas, m.nome AS municipio, m.uf,
              p.capacidade_kg::float AS capacidade_kg, p.estoque_kg::float AS estoque_kg
       FROM local_rede l
       JOIN municipio m ON m.id = l.municipio_id
       LEFT JOIN ponto_coleta p ON p.id = l.ponto_coleta_id
       WHERE l.ativo AND l.latitude BETWEEN $1 AND $2 AND l.longitude BETWEEN $3 AND $4
         AND ($5::tipo_local IS NULL OR l.tipo = $5)
       ORDER BY l.tipo, l.nome
       LIMIT 300`,
      [sul, norte, oeste, leste, tipo ?? null],
    );
    return rows;
  }

  private async buscar(sessao: Sessao, id: string) {
    if (!z.string().uuid().safeParse(id).success) throw new NotFoundException('Local não encontrado.');
    const { rows } = await this.pool.query(
      `SELECT ${COLUNAS}
       FROM local_rede l
       LEFT JOIN bairro b ON b.id = l.bairro_id
       LEFT JOIN ponto_coleta p ON p.id = l.ponto_coleta_id
       WHERE l.id = $1 AND l.municipio_id = $2`,
      [id, sessao.municipioId],
    );
    if (!rows[0]) throw new NotFoundException('Local não encontrado.');
    return rows[0];
  }

  private async conferirBairro(db: Pool | PoolClient, sessao: Sessao, bairroId?: string | null) {
    if (!bairroId) return;
    const r = await db.query('SELECT 1 FROM bairro WHERE id = $1 AND municipio_id = $2', [bairroId, sessao.municipioId]);
    if (!r.rowCount) throw new BadRequestException('Bairro não encontrado no seu município.');
  }
}
