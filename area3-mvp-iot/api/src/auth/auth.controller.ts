import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Inject,
  Logger,
  NotImplementedException,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
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

const identidadeSocial = z.object({
  provedor: z.enum(['google', 'apple', 'facebook']),
  sujeito: z.string().trim().min(1).max(255),
  email: z.string().trim().email('E-mail inválido').max(255).optional(),
});

const SolicitarCodigo = z.object({ telefone });
const Entrar = z.object({ telefone, codigo: z.string().regex(/^\d{6}$/, 'O código tem 6 dígitos') });
const EntrarSocial = identidadeSocial;
const Cadastro = z.object({
  nome: z.string().trim().min(2, 'Informe o seu nome').max(80),
  telefone,
  bairro_id: z.string().uuid('Escolha o seu bairro'),
  perfil: z.enum(['cidadao', 'voluntario']),
  social: identidadeSocial.optional(),
});

type LinhaUsuario = { id: string; perfil: Perfil; municipio_id: string; bairro_id: string | null; nome: string };

function normalizarTelefone(t: string): string {
  return t.startsWith('+') ? t : `+55${t}`;
}

const modoDemo = () => process.env.MODO_DEMO !== 'false';

/**
 * Autenticação do app.
 * - Conta ELO: telefone + código de 6 dígitos (sem senha). No protótipo o código sai no log e,
 *   com MODO_DEMO, volta na resposta.
 * - Login social (Google, Apple, Facebook): no protótipo o provedor é SIMULADO; o app envia o
 *   identificador da conta escolhida e a API confia nele. Por isso só funciona com MODO_DEMO.
 *   Numa versão real, a API recebe o id_token do provedor e valida assinatura, emissor e audiência.
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
    return { ...resposta, ...(await this.gerarCodigo(this.pool, rows[0].id, normalizarTelefone(tel))) };
  }

  @Post('entrar')
  @HttpCode(200)
  async entrar(@Body() corpo: unknown) {
    const { telefone: tel, codigo } = validar(Entrar, corpo);
    const { rows } = await this.pool.query<LinhaUsuario>(
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
    return this.sessaoPara(this.pool, u, 'login');
  }

  /**
   * Login social. Se a identidade já está vinculada, devolve a sessão; se não, devolve
   * `cadastro_necessario` para o app abrir a criação de conta já com a identidade.
   */
  @Post('social')
  @HttpCode(200)
  async entrarSocial(@Body() corpo: unknown) {
    const id = validar(EntrarSocial, corpo);
    this.exigirModoDemo();
    const { rows } = await this.pool.query<LinhaUsuario>(
      `SELECT u.id, u.perfil, u.municipio_id, u.bairro_id, u.nome
       FROM conta_social cs JOIN usuario u ON u.id = cs.usuario_id
       WHERE cs.provedor = $1 AND cs.sujeito = $2`,
      [id.provedor, id.sujeito],
    );
    if (!rows[0]) return { cadastro_necessario: true };
    return this.sessaoPara(this.pool, rows[0], `login_${id.provedor}`);
  }

  /**
   * Cria a conta de cidadão ou voluntário. Com identidade social, já entra; sem ela,
   * envia o código para confirmar o telefone (o app segue para a etapa do código).
   */
  @Post('cadastro')
  @HttpCode(201)
  async cadastrar(@Body() corpo: unknown) {
    const dados = validar(Cadastro, corpo);
    if (dados.social) this.exigirModoDemo();
    const tel = normalizarTelefone(dados.telefone);

    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      const bairro = await c.query<{ municipio_id: string }>('SELECT municipio_id FROM bairro WHERE id = $1', [dados.bairro_id]);
      if (!bairro.rows[0]) throw new BadRequestException('Bairro não encontrado.');
      const existente = await c.query('SELECT 1 FROM usuario WHERE telefone = $1', [tel]);
      if (existente.rowCount) throw new ConflictException('Este telefone já tem uma conta. Use "Entrar na minha conta".');
      if (dados.social) {
        const vinculada = await c.query('SELECT 1 FROM conta_social WHERE provedor = $1 AND sujeito = $2', [dados.social.provedor, dados.social.sujeito]);
        if (vinculada.rowCount) throw new ConflictException('Esta conta já está vinculada a um cadastro do ELO.');
      }

      const { rows } = await c.query<LinhaUsuario>(
        `INSERT INTO usuario (municipio_id, bairro_id, perfil, nome, telefone)
         VALUES ($1,$2,$3,$4,$5) RETURNING id, perfil, municipio_id, bairro_id, nome`,
        [bairro.rows[0].municipio_id, dados.bairro_id, dados.perfil, dados.nome, tel],
      );
      const u = rows[0];
      await auditar(c, { usuarioId: u.id, acao: 'cadastro', entidade: 'usuario', entidadeId: u.id, detalhe: { via: dados.social?.provedor ?? 'telefone' } });

      let resposta: Record<string, unknown>;
      if (dados.social) {
        await c.query('INSERT INTO conta_social (usuario_id, provedor, sujeito, email) VALUES ($1,$2,$3,$4)', [
          u.id, dados.social.provedor, dados.social.sujeito, dados.social.email ?? null,
        ]);
        resposta = await this.sessaoPara(c, u, `login_${dados.social.provedor}`);
      } else {
        resposta = { confirmar_telefone: true, ...(await this.gerarCodigo(c, u.id, tel)) };
      }
      await c.query('COMMIT');
      return resposta;
    } catch (erro) {
      await c.query('ROLLBACK');
      throw erro;
    } finally {
      c.release();
    }
  }

  /** Bairros atendidos, para a tela de criar conta (público: ainda não há sessão). */
  @Get('bairros')
  async bairros() {
    const { rows } = await this.pool.query(
      `SELECT b.id, b.nome, m.nome AS municipio
       FROM bairro b JOIN municipio m ON m.id = b.municipio_id
       ORDER BY m.nome, b.nome`,
    );
    return rows;
  }

  @Get('eu')
  @UseGuards(AuthGuard)
  eu(@SessaoAtual() sessao: Sessao) {
    return sessao;
  }

  private exigirModoDemo() {
    if (!modoDemo()) {
      throw new NotImplementedException('Login social real exige credenciais OAuth do Google, Apple e Facebook, que este protótipo não tem.');
    }
  }

  private async gerarCodigo(db: Pool | PoolClient, usuarioId: string, tel: string): Promise<{ codigo_demo?: string }> {
    const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await db.query(
      `INSERT INTO codigo_acesso (usuario_id, codigo_hash, expira_em) VALUES ($1, $2, now() + interval '10 minutes')`,
      [usuarioId, sha256(`${usuarioId}:${codigo}`)],
    );
    this.log.log(`[SMS simulado] código para ${tel}: ${codigo}`);
    return modoDemo() ? { codigo_demo: codigo } : {};
  }

  private async sessaoPara(db: Pool | PoolClient, u: LinhaUsuario, acao: string) {
    const sessao: Sessao = { usuarioId: u.id, perfil: u.perfil, municipioId: u.municipio_id, bairroId: u.bairro_id, nome: u.nome };
    await auditar(db, { usuarioId: u.id, acao, entidade: 'usuario', entidadeId: u.id });
    return { token: await emitirToken(sessao), usuario: { id: u.id, nome: u.nome, perfil: u.perfil } };
  }
}
