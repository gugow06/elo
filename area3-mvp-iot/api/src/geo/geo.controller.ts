import { Controller, Get, Inject, Query, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { Pool } from 'pg';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import { POOL } from '../infra/banco.module';
import { validar } from '../infra/validacao';
import { buscarEndereco } from './enderecos';
import { ondeEstou } from './onde-estou';

const Posicao = z.object({
  lat: z.coerce.number().min(-34).max(6),
  lon: z.coerce.number().min(-74).max(-34),
});

const Busca = z.object({ q: z.string().trim().min(2, 'Digite pelo menos 2 letras').max(120) });

/** Igual à coluna nome_busca: minúsculas e sem acento. */
export function normalizar(t: string): string {
  return t.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

@Controller()
export class GeoController {
  constructor(@Inject(POOL) private readonly pool: Pool) {}

  /**
   * Estados e cidades (base do IBGE no próprio banco), para busca e filtros.
   * Público: são dados públicos e o cadastro precisa antes de existir sessão.
   */
  @Get('localidades')
  async localidades(@Query() query: unknown) {
    const { q } = validar(Busca, query);
    const n = normalizar(q);
    const ufs = await this.pool.query(
      `SELECT 'uf' AS tipo, sigla AS uf, nome, latitude::float AS latitude, longitude::float AS longitude
       FROM uf
       WHERE lower(sigla) = $1 OR translate(lower(nome), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') LIKE $1 || '%'
       ORDER BY nome LIMIT 3`,
      [n],
    );
    const muns = await this.pool.query(
      `SELECT 'municipio' AS tipo, id, codigo_ibge, nome, uf, latitude::float AS latitude, longitude::float AS longitude
       FROM municipio
       WHERE nome_busca LIKE $1 || '%' OR nome_busca LIKE '% ' || $1 || '%'
       ORDER BY (nome_busca LIKE $1 || '%') DESC, capital DESC, length(nome), nome
       LIMIT 8`,
      [n],
    );
    return [...ufs.rows, ...muns.rows];
  }

  /**
   * Posição do aparelho → cidade do IBGE e bairro, para a criação de conta. Público (vem antes da
   * sessão). A posição não é guardada.
   */
  @Get('geo/onde-estou')
  async ondeEstou(@Query() query: unknown) {
    const { lat, lon } = validar(Posicao, query);
    return ondeEstou(this.pool, lat, lon);
  }

  /** Endereço, CEP ou nome de lugar → candidatos com coordenadas (só Brasil). Ver enderecos.ts. */
  @Get('geo/buscar')
  @UseGuards(AuthGuard)
  async buscar(@Query() query: unknown) {
    const { q } = validar(Busca, query);
    try {
      return await buscarEndereco(q);
    } catch {
      throw new ServiceUnavailableException('A busca de endereço está indisponível agora. Tente de novo em instantes.');
    }
  }
}
