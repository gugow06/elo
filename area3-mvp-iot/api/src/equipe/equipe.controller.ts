import { Body, ConflictException, Controller, Get, Inject, Post, UseGuards } from '@nestjs/common';
import { Pool } from 'pg';
import { z } from 'zod';
import { AuthGuard, Perfis, SessaoAtual } from '../auth/auth.guard';
import { Sessao } from '../auth/sessao';
import { auditar } from '../infra/auditoria';
import { POOL } from '../infra/banco.module';
import { enviarEmail } from '../infra/email';
import { validar } from '../infra/validacao';

const Convite = z.object({
  nome: z.string().trim().min(3, 'Informe o nome').max(80),
  email: z.string().trim().toLowerCase().pipe(z.email('E-mail inválido').max(255)),
  telefone: z.string().transform((t) => t.replace(/[^\d+]/g, '')).pipe(z.string().regex(/^\+?\d{10,13}$/, 'Telefone inválido')),
  perfil: z.enum(['tecnico', 'gestor', 'agente']),
});

/**
 * Equipe do painel: o gestor convida técnicos do CRAS (e outros gestores) do próprio município.
 * O convidado entra no painel com o e-mail e o código enviado pelo Resend; não há senha.
 */
@Controller('gestao/equipe')
@UseGuards(AuthGuard)
@Perfis('gestor')
export class EquipeController {
  constructor(@Inject(POOL) private readonly pool: Pool) {}

  @Get()
  async listar(@SessaoAtual() sessao: Sessao) {
    const { rows } = await this.pool.query(
      `SELECT id, nome, email, telefone, perfil, criado_em FROM usuario
       WHERE municipio_id = $1 AND perfil IN ('tecnico', 'gestor', 'agente')
       ORDER BY perfil, nome`,
      [sessao.municipioId],
    );
    return rows;
  }

  @Post()
  async convidar(@SessaoAtual() sessao: Sessao, @Body() corpo: unknown) {
    const d = validar(Convite, corpo);
    const telefone = d.telefone.startsWith('+') ? d.telefone : `+55${d.telefone}`;
    const dup = await this.pool.query('SELECT 1 FROM usuario WHERE lower(email) = $1 OR telefone = $2', [d.email, telefone]);
    if (dup.rowCount) throw new ConflictException('Já existe uma conta com esse e-mail ou telefone.');
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO usuario (municipio_id, perfil, nome, telefone, email) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [sessao.municipioId, d.perfil, d.nome, telefone, d.email],
    );
    await auditar(this.pool, { usuarioId: sessao.usuarioId, acao: 'convidar_equipe', entidade: 'usuario', entidadeId: rows[0].id, detalhe: { perfil: d.perfil } });
    const painel = process.env.PAINEL_URL || 'http://localhost:3000';
    const papel = d.perfil === 'tecnico' ? 'técnica(o) do CRAS' : d.perfil === 'agente' ? 'agente do ponto de coleta' : 'gestão';
    await enviarEmail(
      d.email,
      'Você foi convidada(o) para o painel do ELO',
      `Olá, ${d.nome}! Você foi convidada(o) como ${papel} no painel do ELO.\n\nAcesse ${painel}/entrar e entre com este e-mail. Vamos mandar um código de 6 dígitos; não precisa de senha.`,
      `<div style="font-family:Arial,sans-serif;color:#14231D;max-width:480px"><p style="font-size:20px;font-weight:800;color:#003B2E">elo</p>
       <p>Olá, ${d.nome.replace(/[<>&"]/g, '')}! Você foi convidada(o) como <strong>${papel}</strong> no painel do ELO.</p>
       <p>Acesse <a href="${painel}/entrar">${painel}/entrar</a> e entre com este e-mail. Vamos mandar um código de 6 dígitos; não precisa de senha.</p></div>`,
    );
    return { id: rows[0].id, nome: d.nome, email: d.email, telefone, perfil: d.perfil };
  }
}
