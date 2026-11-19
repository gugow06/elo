import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, Perfis, SessaoAtual } from '../auth/auth.guard';
import { Sessao } from '../auth/sessao';
import { validar } from '../infra/validacao';
import { SolicitacoesService } from './solicitacoes.service';

const NovaSolicitacao = z.object({
  relato: z.string().trim().min(10, 'Conte um pouco mais sobre o que você precisa').max(2000),
  canal: z.enum(['app', 'whatsapp', 'balcao', 'web_leve']).default('app'),
  bairro_id: z.string().uuid().optional(),
});

const Consulta = z.object({
  protocolo: z.string().regex(/^\d{6}$/, 'O protocolo tem 6 dígitos'),
  nascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD'),
});

@Controller('solicitacoes')
export class SolicitacoesController {
  constructor(@Inject(SolicitacoesService) private readonly servico: SolicitacoesService) {}

  @Post()
  @UseGuards(AuthGuard)
  @Perfis('cidadao', 'voluntario')
  abrir(@SessaoAtual() sessao: Sessao, @Body() corpo: unknown) {
    const d = validar(NovaSolicitacao, corpo);
    return this.servico.abrir(sessao, { relato: d.relato, canal: d.canal, bairroId: d.bairro_id });
  }

  @Get('minhas')
  @UseGuards(AuthGuard)
  @Perfis('cidadao', 'voluntario')
  minhas(@SessaoAtual() sessao: Sessao) {
    return this.servico.minhas(sessao);
  }

  /** Consulta pública (sem login) por protocolo + data de nascimento. */
  @Get('consulta/:protocolo')
  consultar(@Param('protocolo') protocolo: string, @Query('nascimento') nascimento: string) {
    const d = validar(Consulta, { protocolo, nascimento });
    return this.servico.consultarPorProtocolo(d.protocolo, d.nascimento);
  }
}
