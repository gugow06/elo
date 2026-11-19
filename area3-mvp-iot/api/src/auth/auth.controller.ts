import { Body, Controller, Get, HttpCode, Inject, Logger, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { Pool } from 'pg';
import { z } from 'zod';
import { auditar } from '../infra/auditoria';
import { POOL } from '../infra/banco.module';
import { sha256 } from '../infra/hash';
import { validar } from '../infra/validacao';
import { AuthGuard, SessaoAtual } from './auth.guard';
import { emitirToken, Perfil, Sessao } from './sessao';

const telefone = z
  .string()
  .transform((t) => t.replace(/[^\d+]/g, ''))
  .pipe(z.string().regex(/^\+?\d{10,13}$/, 'Telefone inválido'));

const SolicitarCodigo = z.object({ telefone });
const Entrar = z.object({ telefone, codigo: z.string().regex(/^\d{6}$/, 'O código tem 6 dígitos') });

function normalizarTelefone(t: string): string {
  return t.startsWith('+') ? t : `+55${t}`;
}

/**
 * Login sem senha (RF-102): código de 6 dígitos por SMS/WhatsApp.
 * No protótipo o código é exibido no log da API e, com MODO_DEMO, devolvido na resposta.
 */
@Controller('auth')
export class AuthController {
  private readonly log = new Logger('Auth');

  constructor(@Inject(POOL) private readonly pool: Pool) {}

  @Post('codigo')
  @HttpCode(200)
  async solicitarCodigo(@Body() corpo: unknown) {
    const { telefone: tel } = validar(SolicitarCodigo, corpo);
    const { rows } = await this.pool.query<{ id: string }>('SELECT id FROM usuario WHERE telefone = $1', [normalizarTelefone(tel)]);
    const resposta: Record<string, unknown> = { mensagem: 'Se o telefone estiver cadastrado, você receberá um código.' };
    if (!rows[0]) return resposta; // não revela se o telefone existe

    const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.pool.query(
      `INSERT INTO codigo_acesso (usuario_id, codigo_hash, expira_em) VALUES ($1, $2, now() + interval '10 minutes')`,
      [rows[0].id, sha256(`${rows[0].id}:${codigo}`)],
    );
    this.log.log(`[SMS simulado] código para ${normalizarTelefone(tel)}: ${codigo}`);
    if (process.env.MODO_DEMO !== 'false') resposta.codigo_demo = codigo;
    return resposta;
  }

  @Post('entrar')
  @HttpCode(200)
  async entrar(@Body() corpo: unknown) {
    const { telefone: tel, codigo } = validar(Entrar, corpo);
    const { rows } = await this.pool.query<{ id: string; perfil: Perfil; municipio_id: string; bairro_id: string | null; nome: string }>(
      'SELECT id, perfil, municipio_id, bairro_id, nome FROM usuario WHERE telefone = $1',
      [normalizarTelefone(tel)],
    );
    const u = rows[0];
    if (!u) throw new UnauthorizedException('Código inválido ou expirado.');

    const usado = await this.pool.query(
      `UPDATE codigo_acesso SET usado_em = now()
       WHERE id = (SELECT id FROM codigo_acesso
                   WHERE usuario_id = $1 AND codigo_hash = $2 AND usado_em IS NULL AND expira_em > now()
                   ORDER BY expira_em DESC LIMIT 1)
       RETURNING id`,
      [u.id, sha256(`${u.id}:${codigo}`)],
    );
    if (!usado.rowCount) throw new UnauthorizedException('Código inválido ou expirado.');

    const sessao: Sessao = { usuarioId: u.id, perfil: u.perfil, municipioId: u.municipio_id, bairroId: u.bairro_id, nome: u.nome };
    await auditar(this.pool, { usuarioId: u.id, acao: 'login', entidade: 'usuario', entidadeId: u.id });
    return { token: await emitirToken(sessao), usuario: { id: u.id, nome: u.nome, perfil: u.perfil } };
  }

  @Get('eu')
  @UseGuards(AuthGuard)
  eu(@SessaoAtual() sessao: Sessao) {
    return sessao;
  }
}
