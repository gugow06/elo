import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Inject, PayloadTooLargeException, Post, Put, UnauthorizedException, UseGuards } from '@nestjs/common';
import { notificar } from '../infra/notificacoes';
import { excluirConta } from './exclusao';
import { TERMOS_VERSAO } from './termos';
import { Pool } from 'pg';
import { z } from 'zod';
import { AuthGuard, SessaoAtual } from '../auth/auth.guard';
import { consumirCodigo, gerarCodigo, mascararEmail } from '../auth/codigos';
import { Sessao } from '../auth/sessao';
import { auditar } from '../infra/auditoria';
import { POOL } from '../infra/banco.module';
import { validar } from '../infra/validacao';
import { FOTO_MAX_BYTES, sqlUrlFoto, tipoDaImagem } from './fotos';

const ComFoto = z.object({ imagem: z.string().min(1, 'Envie a imagem') });
const ComCodigo = z.object({ codigo: z.string().regex(/^\d{6}$/, 'O código tem 6 dígitos') });
const AceiteTermos = z.object({ versao: z.literal(TERMOS_VERSAO, 'Atualize o app para ver a versão atual dos termos.') });

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
  foto: string | null;
  termos_versao: string | null;
  termos_aceitos_em: Date | null;
};

/**
 * Perfil do usuário logado e verificação da conta.
 * Verificado = e-mail confirmado + verificação em duas etapas por e-mail ativa (decisão F7-D6).
 * Aplicativo autenticador (TOTP) e gov.br ficam para depois.
 * Foto de perfil: pública (F7-D5), guardada no Postgres (F7-D8).
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
      foto: u.foto,
      // Onde o mapa abre quando o aparelho não informa a localização (bairro ou município do cadastro)
      latitude: u.latitude,
      longitude: u.longitude,
      google: u.google,
      email_confirmado: !!u.email_confirmado_em,
      dois_fatores: !!u.dois_fatores_em,
      verificado: !!u.email_confirmado_em && !!u.dois_fatores_em,
      // Termos de uso e política de privacidade: o app pede o aceite quando a versão mudou
      termos: { versao_aceita: u.termos_versao, aceitos_em: u.termos_aceitos_em, versao_atual: TERMOS_VERSAO },
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

  /** Envia ou troca a foto de perfil (imagem em base64; o app já reduz para 512 px). Todos veem a foto. */
  @Put('foto')
  async enviarFoto(@SessaoAtual() sessao: Sessao, @Body() corpo: unknown) {
    const { imagem } = validar(ComFoto, corpo);
    const dados = Buffer.from(imagem.replace(/^data:[^,]*,/, ''), 'base64');
    if (dados.length > FOTO_MAX_BYTES) throw new PayloadTooLargeException('A foto é grande demais. Escolha uma imagem menor.');
    const tipo = tipoDaImagem(dados);
    if (!tipo) throw new BadRequestException('Envie uma foto em JPG, PNG ou WebP.');
    await this.pool.query(
      `INSERT INTO foto_usuario (usuario_id, tipo, dados) VALUES ($1, $2, $3)
       ON CONFLICT (usuario_id) DO UPDATE SET id = gen_random_uuid(), tipo = EXCLUDED.tipo, dados = EXCLUDED.dados, criada_em = now()`,
      [sessao.usuarioId, tipo, dados],
    );
    await auditar(this.pool, { usuarioId: sessao.usuarioId, acao: 'enviar_foto', entidade: 'usuario', entidadeId: sessao.usuarioId });
    return this.perfil(sessao);
  }

  @Delete('foto')
  async removerFoto(@SessaoAtual() sessao: Sessao) {
    await this.pool.query('DELETE FROM foto_usuario WHERE usuario_id = $1', [sessao.usuarioId]);
    await auditar(this.pool, { usuarioId: sessao.usuarioId, acao: 'remover_foto', entidade: 'usuario', entidadeId: sessao.usuarioId });
    return this.perfil(sessao);
  }

  /** Aceite da versão atual dos Termos de uso e da Política de privacidade (contas antigas ou termos novos). */
  @Post('termos')
  @HttpCode(200)
  async aceitarTermos(@SessaoAtual() sessao: Sessao, @Body() corpo: unknown) {
    validar(AceiteTermos, corpo);
    await this.pool.query('UPDATE usuario SET termos_versao = $2, termos_aceitos_em = now() WHERE id = $1', [sessao.usuarioId, TERMOS_VERSAO]);
    await auditar(this.pool, { usuarioId: sessao.usuarioId, acao: 'aceitar_termos', entidade: 'usuario', entidadeId: sessao.usuarioId, detalhe: { versao: TERMOS_VERSAO } });
    return this.perfil(sessao);
  }

  /** Exclusão de conta, passo 1: código no e-mail, para confirmar que é a própria pessoa. */
  @Post('excluir/codigo')
  @HttpCode(200)
  async codigoExclusao(@SessaoAtual() sessao: Sessao) {
    const u = await this.carregar(sessao.usuarioId);
    if (!u.email) throw new BadRequestException('Esta conta não tem e-mail. Fale com a equipe do CRAS para excluir.');
    return { email: mascararEmail(u.email), ...(await gerarCodigo(this.pool, sessao.usuarioId, { email: u.email })) };
  }

  /**
   * Exclusão de conta, passo 2 (LGPD, art. 18): apaga os dados pessoais e encerra a sessão.
   * O que acontece está em `excluirConta` e na Política de privacidade.
   */
  @Post('excluir')
  @HttpCode(200)
  async excluir(@SessaoAtual() sessao: Sessao, @Body() corpo: unknown) {
    const { codigo } = validar(ComCodigo, corpo);
    if (!(await consumirCodigo(this.pool, sessao.usuarioId, codigo))) throw new UnauthorizedException('Código inválido ou expirado.');
    const resumo = await excluirConta(this.pool, sessao.usuarioId);
    for (const n of resumo.avisos) await notificar(this.pool, n).catch(() => undefined);
    return { ok: true, pedidos_encerrados: resumo.pedidosEncerrados, ajudas_canceladas: resumo.ajudasCanceladas };
  }

  private async carregar(usuarioId: string): Promise<LinhaPerfil> {
    const { rows } = await this.pool.query<LinhaPerfil>(
      `SELECT u.nome, u.email, u.telefone, b.nome AS bairro, m.nome AS municipio, m.uf,
              coalesce(b.latitude, m.latitude)::float AS latitude, coalesce(b.longitude, m.longitude)::float AS longitude,
              u.email_confirmado_em, u.dois_fatores_em, ${sqlUrlFoto('f.id')} AS foto, u.termos_versao, u.termos_aceitos_em,
              EXISTS (SELECT 1 FROM conta_social cs WHERE cs.usuario_id = u.id AND cs.provedor = 'google') AS google
       FROM usuario u
       JOIN municipio m ON m.id = u.municipio_id
       LEFT JOIN bairro b ON b.id = u.bairro_id
       LEFT JOIN foto_usuario f ON f.usuario_id = u.id
       WHERE u.id = $1`,
      [usuarioId],
    );
    if (!rows[0]) throw new UnauthorizedException('Conta não encontrada.');
    return rows[0];
  }
}
