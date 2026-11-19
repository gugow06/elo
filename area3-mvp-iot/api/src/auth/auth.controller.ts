import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
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
import { emailCodigo, enviarEmail } from '../infra/email';
import { sha256 } from '../infra/hash';
import { validar } from '../infra/validacao';
import { AuthGuard, SessaoAtual } from './auth.guard';
import { GoogleNaoConfigurado, IdentidadeGoogle, verificarTokenGoogle } from './google';
import { emitirToken, Perfil, Sessao } from './sessao';

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

/** Google: ID token real. Apple e Facebook: provedor simulado (só com MODO_DEMO). */
const social = z.discriminatedUnion('provedor', [
  z.object({ provedor: z.literal('google'), id_token: z.string().min(20) }),
  z.object({ provedor: z.enum(['apple', 'facebook']), sujeito: z.string().trim().min(1).max(255), email: email.optional() }),
]);

const SolicitarCodigo = identificador;
const Entrar = identificador.and(z.object({ codigo }));
const Cadastro = z.object({
  nome: z.string().trim().min(2, 'Informe o seu nome').max(80),
  email,
  telefone,
  bairro_id: z.string().uuid('Escolha o seu bairro'),
  perfil: z.enum(['cidadao', 'voluntario']),
  social: social.optional(),
});

type LinhaUsuario = { id: string; perfil: Perfil; municipio_id: string; bairro_id: string | null; nome: string };
type Social = z.infer<typeof social>;
/** Identidade social já conferida: sujeito estável do provedor e e-mail. */
type SocialConferida = { provedor: Social['provedor']; sujeito: string; email: string | null; nome: string | null };

const COLUNAS = 'id, perfil, municipio_id, bairro_id, nome';
const MAX_CODIGOS_ATIVOS = 5;

function normalizarTelefone(t: string): string {
  return t.startsWith('+') ? t : `+55${t}`;
}

const modoDemo = () => process.env.MODO_DEMO !== 'false';

/**
 * Autenticação do app e do painel.
 * - Conta ELO: e-mail + código de 6 dígitos enviado pelo Resend (sem senha). O painel da equipe
 *   continua por telefone, com SMS simulado. Com MODO_DEMO, o código também volta na resposta.
 * - Google: real. O app manda o ID token e a API confere com as chaves públicas do Google.
 * - Apple e Facebook: SIMULADOS no protótipo (só com MODO_DEMO). Exigem conta de desenvolvedor
 *   (Apple: programa pago e URL HTTPS pública de retorno) que o protótipo não tem.
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
    return { ...resposta, ...(await this.gerarCodigo(this.pool, u.id, id.email ? { email: id.email } : { telefone: normalizarTelefone(id.telefone!) })) };
  }

  @Post('entrar')
  @HttpCode(200)
  async entrar(@Body() corpo: unknown) {
    const d = validar(Entrar, corpo);
    const u = await this.buscarPorIdentificador(d);
    if (!u) throw new UnauthorizedException('Código inválido ou expirado.');

    const usado = await this.pool.query(
      `UPDATE codigo_acesso SET usado_em = now()
       WHERE id = (SELECT id FROM codigo_acesso
                   WHERE usuario_id = $1 AND codigo_hash = $2 AND usado_em IS NULL AND expira_em > now()
                   ORDER BY expira_em DESC LIMIT 1)
       RETURNING id`,
      [u.id, sha256(`${u.id}:${d.codigo}`)],
    );
    if (!usado.rowCount) throw new UnauthorizedException('Código inválido ou expirado.');
    return this.sessaoPara(this.pool, u, 'login');
  }

  /**
   * Login social. Conta já vinculada: entra. Google com e-mail de uma conta existente: vincula e entra
   * (o Google confirmou o e-mail). Sem conta: devolve `cadastro_necessario` com nome e e-mail para o
   * app abrir a criação de conta.
   */
  @Post('social')
  @HttpCode(200)
  async entrarSocial(@Body() corpo: unknown) {
    const id = await this.conferirSocial(validar(social, corpo));
    const vinculada = await this.pool.query<LinhaUsuario>(
      `SELECT u.id, u.perfil, u.municipio_id, u.bairro_id, u.nome
       FROM conta_social cs JOIN usuario u ON u.id = cs.usuario_id
       WHERE cs.provedor = $1 AND cs.sujeito = $2`,
      [id.provedor, id.sujeito],
    );
    if (vinculada.rows[0]) return this.sessaoPara(this.pool, vinculada.rows[0], `login_${id.provedor}`);

    if (id.provedor === 'google' && id.email) {
      const porEmail = await this.pool.query<LinhaUsuario>(`SELECT ${COLUNAS} FROM usuario WHERE lower(email) = $1`, [id.email]);
      const u = porEmail.rows[0];
      if (u) {
        await this.pool.query(
          'INSERT INTO conta_social (usuario_id, provedor, sujeito, email) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
          [u.id, id.provedor, id.sujeito, id.email],
        );
        return this.sessaoPara(this.pool, u, `login_${id.provedor}`);
      }
    }
    return { cadastro_necessario: true, nome: id.nome, email: id.email };
  }

  /**
   * Cria a conta de cidadão ou voluntário. Com conta social, já entra; sem ela, envia o código
   * para o e-mail (o app segue para a etapa do código).
   */
  @Post('cadastro')
  @HttpCode(201)
  async cadastrar(@Body() corpo: unknown) {
    const dados = validar(Cadastro, corpo);
    const id = dados.social ? await this.conferirSocial(dados.social) : null;
    // No Google, vale o e-mail confirmado pelo Google
    const emailConta = id?.provedor === 'google' && id.email ? id.email : dados.email;
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
        `INSERT INTO usuario (municipio_id, bairro_id, perfil, nome, telefone, email)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${COLUNAS}`,
        [bairro.rows[0].municipio_id, dados.bairro_id, dados.perfil, dados.nome, tel, emailConta],
      );
      const u = rows[0];
      await auditar(c, { usuarioId: u.id, acao: 'cadastro', entidade: 'usuario', entidadeId: u.id, detalhe: { via: id?.provedor ?? 'email' } });

      let resposta: Record<string, unknown>;
      if (id) {
        await c.query('INSERT INTO conta_social (usuario_id, provedor, sujeito, email) VALUES ($1,$2,$3,$4)', [u.id, id.provedor, id.sujeito, id.email]);
        resposta = await this.sessaoPara(c, u, `login_${id.provedor}`);
      } else {
        resposta = { confirmar_email: true, ...(await this.gerarCodigo(c, u.id, { email: emailConta })) };
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

  private async conferirSocial(s: Social): Promise<SocialConferida> {
    if (s.provedor === 'google') {
      let g: IdentidadeGoogle;
      try {
        g = await verificarTokenGoogle(s.id_token);
      } catch (erro) {
        if (erro instanceof GoogleNaoConfigurado) throw new NotImplementedException('Login com Google não configurado na API (GOOGLE_CLIENT_IDS).');
        this.log.warn(`Token do Google recusado: ${(erro as Error).message}`);
        throw new UnauthorizedException('Não foi possível confirmar a sua conta Google. Tente de novo.');
      }
      return { provedor: 'google', sujeito: g.sujeito, email: g.email, nome: g.nome };
    }
    if (!modoDemo()) {
      throw new NotImplementedException(`Login com ${s.provedor === 'apple' ? 'Apple' : 'Facebook'} ainda não está disponível.`);
    }
    return { provedor: s.provedor, sujeito: s.sujeito, email: s.email ?? null, nome: null };
  }

  private async gerarCodigo(db: Pool | PoolClient, usuarioId: string, destino: { email: string } | { telefone: string }) {
    const ativos = await db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM codigo_acesso WHERE usuario_id = $1 AND usado_em IS NULL AND expira_em > now()',
      [usuarioId],
    );
    if (ativos.rows[0].n >= MAX_CODIGOS_ATIVOS) {
      throw new HttpException('Muitos códigos pedidos. Use o último que chegou ou aguarde 10 minutos.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const cod = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await db.query(
      `INSERT INTO codigo_acesso (usuario_id, codigo_hash, expira_em) VALUES ($1, $2, now() + interval '10 minutes')`,
      [usuarioId, sha256(`${usuarioId}:${cod}`)],
    );
    if ('email' in destino) {
      const m = emailCodigo(cod);
      await enviarEmail(destino.email, m.assunto, m.texto, m.html);
    } else {
      this.log.log(`[SMS simulado] código para ${destino.telefone}: ${cod}`);
    }
    return modoDemo() ? { codigo_demo: cod } : {};
  }

  private async sessaoPara(db: Pool | PoolClient, u: LinhaUsuario, acao: string) {
    const sessao: Sessao = { usuarioId: u.id, perfil: u.perfil, municipioId: u.municipio_id, bairroId: u.bairro_id, nome: u.nome };
    await auditar(db, { usuarioId: u.id, acao, entidade: 'usuario', entidadeId: u.id });
    return { token: await emitirToken(sessao), usuario: { id: u.id, nome: u.nome, perfil: u.perfil } };
  }
}
