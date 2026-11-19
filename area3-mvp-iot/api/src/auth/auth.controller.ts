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
import { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { auditar } from '../infra/auditoria';
import { POOL } from '../infra/banco.module';
import { validar } from '../infra/validacao';
import { AuthGuard, SessaoAtual } from './auth.guard';
import { consumirCodigo, gerarCodigo, mascararEmail } from './codigos';
import { GoogleNaoConfigurado, IdentidadeGoogle, verificarTokenGoogle } from './google';
import { emitirDesafio, emitirToken, lerDesafio, Perfil, Sessao } from './sessao';

const telefone = z
  .string()
  .transform((t) => t.replace(/[^\d+]/g, ''))
  .pipe(z.string().regex(/^\+?\d{10,13}$/, 'Telefone inválido'));
const email = z.string().trim().toLowerCase().pipe(z.email('E-mail inválido').max(255));
const codigo = z.string().regex(/^\d{6}$/, 'O código tem 6 dígitos');

/** E-mail (app) ou telefone (painel da equipe). */
const identificador = z
  .object({ email: email.optional(), telefone: telefone.optional() })
  .refine((d) => d.email || d.telefone, { message: 'Informe o e-mail.', path: ['email'] });

/** Login com Google: ID token do "Fazer login com o Google", conferido na API. */
const social = z.object({ provedor: z.literal('google'), id_token: z.string().min(20) });

const SolicitarCodigo = identificador;
const ConfirmarDoisFatores = z.object({ desafio: z.string().min(20), codigo });
const Entrar = identificador.and(z.object({ codigo }));
const Cadastro = z.object({
  nome: z.string().trim().min(2, 'Informe o seu nome').max(80),
  email,
  telefone,
  bairro_id: z.string().uuid('Escolha o seu bairro'),
  social: social.optional(),
});

type LinhaUsuario = {
  id: string;
  perfil: Perfil;
  municipio_id: string;
  bairro_id: string | null;
  nome: string;
  email: string | null;
  dois_fatores_em: Date | null;
};

const COLUNAS = 'id, perfil, municipio_id, bairro_id, nome, email, dois_fatores_em';

function normalizarTelefone(t: string): string {
  return t.startsWith('+') ? t : `+55${t}`;
}

/**
 * Autenticação do app e do painel.
 * - Conta ELO: e-mail + código de 6 dígitos enviado pelo Resend (sem senha). O painel da equipe
 *   continua por telefone, com SMS simulado. Com MODO_DEMO, o código também volta na resposta.
 * - Google: o app manda o ID token e a API confere com as chaves públicas do Google.
 */
@Controller('auth')
export class AuthController {
  private readonly log = new Logger('Auth');

  constructor(@Inject(POOL) private readonly pool: Pool) {}

  @Post('codigo')
  @HttpCode(200)
  async solicitarCodigo(@Body() corpo: unknown) {
    const id = validar(SolicitarCodigo, corpo);
    const u = await this.buscarPorIdentificador(id);
    const via = id.email ? 'e-mail' : 'telefone';
    const resposta = { mensagem: `Se o ${via} estiver cadastrado, você receberá um código.` };
    if (!u) return resposta; // não revela se a conta existe
    return { ...resposta, ...(await gerarCodigo(this.pool, u.id, id.email ? { email: id.email } : { telefone: normalizarTelefone(id.telefone!) })) };
  }

  @Post('entrar')
  @HttpCode(200)
  async entrar(@Body() corpo: unknown) {
    const d = validar(Entrar, corpo);
    const u = await this.buscarPorIdentificador(d);
    if (!u) throw new UnauthorizedException('Código inválido ou expirado.');

    if (!(await consumirCodigo(this.pool, u.id, d.codigo))) throw new UnauthorizedException('Código inválido ou expirado.');
    // Código recebido no e-mail = e-mail confirmado
    if (d.email) await this.pool.query('UPDATE usuario SET email_confirmado_em = coalesce(email_confirmado_em, now()) WHERE id = $1', [u.id]);
    return this.sessaoPara(this.pool, u, 'login');
  }

  /**
   * Login com Google. Conta já vinculada: entra. E-mail de uma conta existente: vincula e entra
   * (o Google confirmou o e-mail). Sem conta: devolve `cadastro_necessario` com nome e e-mail para o
   * app abrir a criação de conta.
   */
  @Post('social')
  @HttpCode(200)
  async entrarSocial(@Body() corpo: unknown) {
    const id = await this.conferirSocial(validar(social, corpo));
    const vinculada = await this.pool.query<LinhaUsuario>(
      `SELECT u.id, u.perfil, u.municipio_id, u.bairro_id, u.nome, u.email, u.dois_fatores_em
       FROM conta_social cs JOIN usuario u ON u.id = cs.usuario_id
       WHERE cs.provedor = $1 AND cs.sujeito = $2`,
      [id.provedor, id.sujeito],
    );
    if (vinculada.rows[0]) return this.concluirGoogle(vinculada.rows[0]);

    const porEmail = await this.pool.query<LinhaUsuario>(`SELECT ${COLUNAS} FROM usuario WHERE lower(email) = $1`, [id.email]);
    const u = porEmail.rows[0];
    if (u) {
      await this.pool.query(
        'INSERT INTO conta_social (usuario_id, provedor, sujeito, email) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        [u.id, id.provedor, id.sujeito, id.email],
      );
      return this.concluirGoogle(u);
    }
    return { cadastro_necessario: true, nome: id.nome, email: id.email };
  }

  /** Segundo passo do login com Google, quando a verificação em duas etapas está ativa. */
  @Post('social/confirmar')
  @HttpCode(200)
  async confirmarDoisFatores(@Body() corpo: unknown) {
    const d = validar(ConfirmarDoisFatores, corpo);
    let usuarioId: string;
    try {
      usuarioId = await lerDesafio(d.desafio);
    } catch {
      throw new UnauthorizedException('A confirmação expirou. Entre com o Google de novo.');
    }
    const { rows } = await this.pool.query<LinhaUsuario>(`SELECT ${COLUNAS} FROM usuario WHERE id = $1`, [usuarioId]);
    if (!rows[0] || !(await consumirCodigo(this.pool, usuarioId, d.codigo))) {
      throw new UnauthorizedException('Código inválido ou expirado.');
    }
    return this.sessaoPara(this.pool, rows[0], 'login_google_2fa');
  }

  /**
   * Cria a conta do app. Não há escolha de perfil: toda conta pede e oferece ajuda (perfil 'cidadao',
   * que tem as mesmas permissões de 'voluntario' no app). Com conta Google, já entra; sem ela, envia o código
   * para o e-mail (o app segue para a etapa do código).
   */
  @Post('cadastro')
  @HttpCode(201)
  async cadastrar(@Body() corpo: unknown) {
    const dados = validar(Cadastro, corpo);
    const id = dados.social ? await this.conferirSocial(dados.social) : null;
    // Com Google, vale o e-mail confirmado pelo Google
    const emailConta = id?.email ?? dados.email;
    const tel = normalizarTelefone(dados.telefone);

    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      const bairro = await c.query<{ municipio_id: string }>('SELECT municipio_id FROM bairro WHERE id = $1', [dados.bairro_id]);
      if (!bairro.rows[0]) throw new BadRequestException('Bairro não encontrado.');
      if ((await c.query('SELECT 1 FROM usuario WHERE lower(email) = $1', [emailConta])).rowCount) {
        throw new ConflictException('Este e-mail já tem uma conta. Use "Entrar na minha conta".');
      }
      if ((await c.query('SELECT 1 FROM usuario WHERE telefone = $1', [tel])).rowCount) {
        throw new ConflictException('Este telefone já tem uma conta. Use "Entrar na minha conta".');
      }
      if (id && (await c.query('SELECT 1 FROM conta_social WHERE provedor = $1 AND sujeito = $2', [id.provedor, id.sujeito])).rowCount) {
        throw new ConflictException('Esta conta já está vinculada a um cadastro do ELO.');
      }

      const { rows } = await c.query<LinhaUsuario>(
        `INSERT INTO usuario (municipio_id, bairro_id, perfil, nome, telefone, email, email_confirmado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${COLUNAS}`,
        [bairro.rows[0].municipio_id, dados.bairro_id, 'cidadao', dados.nome, tel, emailConta, id ? new Date() : null],
      );
      const u = rows[0];
      await auditar(c, { usuarioId: u.id, acao: 'cadastro', entidade: 'usuario', entidadeId: u.id, detalhe: { via: id ? 'google' : 'email' } });

      let resposta: Record<string, unknown>;
      if (id) {
        await c.query('INSERT INTO conta_social (usuario_id, provedor, sujeito, email) VALUES ($1,$2,$3,$4)', [u.id, id.provedor, id.sujeito, id.email]);
        resposta = await this.sessaoPara(c, u, 'login_google');
      } else {
        resposta = { confirmar_email: true, ...(await gerarCodigo(c, u.id, { email: emailConta })) };
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

  private async buscarPorIdentificador(id: { email?: string; telefone?: string }): Promise<LinhaUsuario | undefined> {
    const { rows } = id.email
      ? await this.pool.query<LinhaUsuario>(`SELECT ${COLUNAS} FROM usuario WHERE lower(email) = $1`, [id.email])
      : await this.pool.query<LinhaUsuario>(`SELECT ${COLUNAS} FROM usuario WHERE telefone = $1`, [normalizarTelefone(id.telefone!)]);
    return rows[0];
  }

  private async conferirSocial(s: z.infer<typeof social>): Promise<IdentidadeGoogle & { provedor: 'google' }> {
    try {
      return { provedor: 'google', ...(await verificarTokenGoogle(s.id_token)) };
    } catch (erro) {
      if (erro instanceof GoogleNaoConfigurado) throw new NotImplementedException('Login com Google não configurado na API (GOOGLE_CLIENT_IDS).');
      this.log.warn(`Token do Google recusado: ${(erro as Error).message}`);
      throw new UnauthorizedException('Não foi possível confirmar a sua conta Google. Tente de novo.');
    }
  }

  /**
   * Conta Google confirmada: o Google já confirmou o e-mail. Com a verificação em duas etapas
   * ativa, envia o código ao e-mail e devolve um desafio em vez da sessão.
   */
  private async concluirGoogle(u: LinhaUsuario) {
    await this.pool.query('UPDATE usuario SET email_confirmado_em = coalesce(email_confirmado_em, now()) WHERE id = $1', [u.id]);
    if (u.dois_fatores_em && u.email) {
      const extra = await gerarCodigo(this.pool, u.id, { email: u.email });
      return { dois_fatores: true, desafio: await emitirDesafio(u.id), email: mascararEmail(u.email), ...extra };
    }
    return this.sessaoPara(this.pool, u, 'login_google');
  }

  private async sessaoPara(db: Pool | PoolClient, u: LinhaUsuario, acao: string) {
    const sessao: Sessao = { usuarioId: u.id, perfil: u.perfil, municipioId: u.municipio_id, bairroId: u.bairro_id, nome: u.nome };
    await auditar(db, { usuarioId: u.id, acao, entidade: 'usuario', entidadeId: u.id });
    return { token: await emitirToken(sessao), usuario: { id: u.id, nome: u.nome, perfil: u.perfil } };
  }
}
