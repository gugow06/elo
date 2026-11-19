import { BadRequestException, Body, Controller, Get, HttpCode, Inject, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Pool } from 'pg';
import { z } from 'zod';
import { AuthGuard, SessaoAtual } from '../auth/auth.guard';
import { consumirCodigo, gerarCodigo, mascararEmail } from '../auth/codigos';
import { Sessao } from '../auth/sessao';
import { auditar } from '../infra/auditoria';
import { POOL } from '../infra/banco.module';
import { validar } from '../infra/validacao';

const ComCodigo = z.object({ codigo: z.string().regex(/^\d{6}$/, 'O código tem 6 dígitos') });

type LinhaPerfil = {
  nome: string;
  email: string | null;
  telefone: string;
  bairro: string | null;
  municipio: string;
  uf: string;
  email_confirmado_em: Date | null;
  dois_fatores_em: Date | null;
  google: boolean;
  latitude: number | null;
  longitude: number | null;
};

/**
 * Perfil do usuário logado e verificação da conta.
 * Verificado = e-mail confirmado + verificação em duas etapas por e-mail ativa (decisão F7-D6).
 * Aplicativo autenticador (TOTP) e gov.br ficam para depois.
 */
@Controller('perfil')
@UseGuards(AuthGuard)
export class PerfilController {
  constructor(@Inject(POOL) private readonly pool: Pool) {}

  @Get()
  async perfil(@SessaoAtual() sessao: Sessao) {
    const u = await this.carregar(sessao.usuarioId);
    return {
      nome: u.nome,
      email: u.email,
      telefone: u.telefone,
      bairro: u.bairro,
      municipio: u.municipio,
      uf: u.uf,
      // Onde o mapa abre quando o aparelho não informa a localização (bairro ou município do cadastro)
      latitude: u.latitude,
      longitude: u.longitude,
      google: u.google,
      email_confirmado: !!u.email_confirmado_em,
      dois_fatores: !!u.dois_fatores_em,
      verificado: !!u.email_confirmado_em && !!u.dois_fatores_em,
    };
  }

  /** Envia o código ao e-mail para ativar ou desativar a verificação em duas etapas. */
  @Post('2fa/codigo')
  @HttpCode(200)
  async codigoDoisFatores(@SessaoAtual() sessao: Sessao) {
    const u = await this.carregar(sessao.usuarioId);
    if (!u.email) throw new BadRequestException('Cadastre um e-mail para usar a verificação em duas etapas.');
    return { email: mascararEmail(u.email), ...(await gerarCodigo(this.pool, sessao.usuarioId, { email: u.email })) };
  }

  @Post('2fa/ativar')
  @HttpCode(200)
  async ativar(@SessaoAtual() sessao: Sessao, @Body() corpo: unknown) {
    const { codigo } = validar(ComCodigo, corpo);
    if (!(await consumirCodigo(this.pool, sessao.usuarioId, codigo))) throw new UnauthorizedException('Código inválido ou expirado.');
    // O código chegou no e-mail: também confirma o e-mail
    await this.pool.query(
      `UPDATE usuario SET dois_fatores_em = coalesce(dois_fatores_em, now()),
                          email_confirmado_em = coalesce(email_confirmado_em, now())
       WHERE id = $1`,
      [sessao.usuarioId],
    );
    await auditar(this.pool, { usuarioId: sessao.usuarioId, acao: 'ativar_2fa', entidade: 'usuario', entidadeId: sessao.usuarioId });
    return this.perfil(sessao);
  }

  @Post('2fa/desativar')
  @HttpCode(200)
  async desativar(@SessaoAtual() sessao: Sessao, @Body() corpo: unknown) {
    const { codigo } = validar(ComCodigo, corpo);
    if (!(await consumirCodigo(this.pool, sessao.usuarioId, codigo))) throw new UnauthorizedException('Código inválido ou expirado.');
    await this.pool.query('UPDATE usuario SET dois_fatores_em = NULL WHERE id = $1', [sessao.usuarioId]);
    await auditar(this.pool, { usuarioId: sessao.usuarioId, acao: 'desativar_2fa', entidade: 'usuario', entidadeId: sessao.usuarioId });
    return this.perfil(sessao);
  }

  private async carregar(usuarioId: string): Promise<LinhaPerfil> {
    const { rows } = await this.pool.query<LinhaPerfil>(
      `SELECT u.nome, u.email, u.telefone, b.nome AS bairro, m.nome AS municipio, m.uf,
              coalesce(b.latitude, m.latitude)::float AS latitude, coalesce(b.longitude, m.longitude)::float AS longitude,
              u.email_confirmado_em, u.dois_fatores_em,
              EXISTS (SELECT 1 FROM conta_social cs WHERE cs.usuario_id = u.id AND cs.provedor = 'google') AS google
       FROM usuario u
       JOIN municipio m ON m.id = u.municipio_id
       LEFT JOIN bairro b ON b.id = u.bairro_id
       WHERE u.id = $1`,
      [usuarioId],
    );
    if (!rows[0]) throw new UnauthorizedException('Conta não encontrada.');
    return rows[0];
  }
}
