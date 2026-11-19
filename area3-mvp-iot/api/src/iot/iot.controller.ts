import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  UnauthorizedException,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { Pool } from 'pg';
import { z } from 'zod';
import { AuthGuard, SessaoAtual } from '../auth/auth.guard';
import { Sessao } from '../auth/sessao';
import { POOL } from '../infra/banco.module';
import { EventosService } from '../infra/eventos.service';
import { sha256 } from '../infra/hash';
import { notificar } from '../infra/notificacoes';
import { validar } from '../infra/validacao';

/** Limiares do Ponto de Coleta Inteligente. */
export const LIMIARES = {
  /** Variação mínima de peso para considerar que houve depósito. */
  deltaMinimoKg: 0.5,
  temperaturaMaxC: 30,
  umidadeMaxPct: 75,
  /** Abaixo deste percentual da capacidade, o ponto é marcado como "estoque baixo". */
  estoqueBaixoPct: 15,
};

const protocolo = z.string().regex(/^\d{6}$/, 'Protocolo deve ter 6 dígitos');
const kg = z.number().min(-1000).max(5000);

const Evento = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('leitura_sensor'),
    peso_kg: kg.min(0),
    temperatura_c: z.number().min(-20).max(80),
    umidade_pct: z.number().min(0).max(100).optional(),
  }),
  z.object({
    tipo: z.literal('entrega_depositada'),
    protocolo,
    delta_peso_kg: kg,
    peso_kg: kg.min(0),
    temperatura_c: z.number().min(-20).max(80).optional(),
  }),
  z.object({
    tipo: z.literal('retirada'),
    protocolo,
    delta_peso_kg: kg,
    peso_kg: kg.min(0),
  }),
]);

interface Ponto {
  id: string;
  municipio_id: string;
  nome: string;
  capacidade_kg: string;
  device_key_hash: string;
}

/** Linhas de no máximo 16 caracteres, sem acento, para o LCD 16x2. */
function lcd(l1: string, l2 = ''): [string, string] {
  const limpar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').slice(0, 16);
  return [limpar(l1), limpar(l2)];
}

/**
 * Ponto de Coleta Inteligente (IoT). O dispositivo se autentica com a chave do ponto
 * (X-Device-Key, guardada como hash) e envia leituras e eventos de entrega.
 */
@Controller('iot/pontos')
export class IotController {
  constructor(
    @Inject(POOL) private readonly pool: Pool,
    @Inject(EventosService) private readonly eventos: EventosService,
  ) {}

  private async autenticar(pontoId: string, chave?: string): Promise<Ponto> {
    if (!z.string().uuid().safeParse(pontoId).success) throw new NotFoundException('Ponto de coleta não encontrado.');
    const { rows } = await this.pool.query<Ponto>(
      'SELECT id, municipio_id, nome, capacidade_kg, device_key_hash FROM ponto_coleta WHERE id = $1',
      [pontoId],
    );
    const ponto = rows[0];
    if (!ponto) throw new NotFoundException('Ponto de coleta não encontrado.');
    const esperado = Buffer.from(ponto.device_key_hash, 'hex');
    const recebido = Buffer.from(sha256(chave ?? ''), 'hex');
    if (!chave || !timingSafeEqual(esperado, recebido)) throw new UnauthorizedException('Chave do dispositivo inválida.');
    return ponto;
  }

  /** Estado atual do ponto, para o dispositivo sincronizar a balança ao ligar. */
  @Get(':id/estado')
  async estado(@Param('id') id: string, @Headers('x-device-key') chave?: string) {
    const ponto = await this.autenticar(id, chave);
    const { rows } = await this.pool.query<{ estoque_kg: number }>('SELECT estoque_kg::float AS estoque_kg FROM ponto_coleta WHERE id = $1', [ponto.id]);
    return { ponto: ponto.nome, capacidade_kg: Number(ponto.capacidade_kg), estoque_kg: rows[0].estoque_kg, limiares: LIMIARES };
  }

  /** O teclado do ponto consulta o protocolo antes do depósito, para mostrar o pedido no LCD. */
  @Get(':id/protocolos/:protocolo')
  async conferirProtocolo(@Param('id') id: string, @Param('protocolo') p: string, @Headers('x-device-key') chave?: string) {
    const ponto = await this.autenticar(id, chave);
    validar(protocolo, p);
    const { rows } = await this.pool.query<{ titulo: string; bairro: string }>(
      `SELECT s.titulo, b.nome AS bairro FROM solicitacao s JOIN bairro b ON b.id = s.bairro_id
       WHERE s.municipio_id = $1 AND s.protocolo = $2 AND s.status = 'em_atendimento'
         AND (s.ponto_coleta_id = $3 OR s.ponto_coleta_id IS NULL)`,
      [ponto.municipio_id, p, ponto.id],
    );
    if (!rows[0]) return { valido: false, lcd: lcd('Protocolo nao', 'encontrado') };
    return { valido: true, titulo: rows[0].titulo, lcd: lcd(rows[0].titulo, `Bairro ${rows[0].bairro}`) };
  }

  @Post(':id/eventos')
  @HttpCode(200)
  async receber(@Param('id') id: string, @Headers('x-device-key') chave: string | undefined, @Body() corpo: unknown) {
    const ponto = await this.autenticar(id, chave);
    const evento = validar(Evento, corpo);
    await this.pool.query('INSERT INTO evento_iot (ponto_coleta_id, tipo, payload) VALUES ($1,$2,$3)', [ponto.id, evento.tipo, JSON.stringify(evento)]);
    await this.pool.query('UPDATE ponto_coleta SET estoque_kg = $2 WHERE id = $1', [ponto.id, evento.peso_kg]);

    if (evento.tipo === 'leitura_sensor') return this.leitura(ponto, evento);
    if (evento.tipo === 'entrega_depositada') return this.entrega(ponto, evento);
    return this.retirada(ponto, evento);
  }

  private async leitura(ponto: Ponto, e: { peso_kg: number; temperatura_c: number; umidade_pct?: number }) {
    const alertas: string[] = [];
    if (e.temperatura_c > LIMIARES.temperaturaMaxC) alertas.push(`Temperatura alta: ${e.temperatura_c} °C`);
    if (e.umidade_pct !== undefined && e.umidade_pct > LIMIARES.umidadeMaxPct) alertas.push(`Umidade alta: ${e.umidade_pct}%`);
    const pctEstoque = (e.peso_kg / Number(ponto.capacidade_kg)) * 100;
    if (pctEstoque < LIMIARES.estoqueBaixoPct) alertas.push(`Estoque baixo: ${e.peso_kg} kg`);

    this.eventos.emitir({ tipo: 'leitura_sensor', municipioId: ponto.municipio_id, pontoId: ponto.id, dados: { ...e, alertas } });
    if (alertas.length) {
      this.eventos.emitir({ tipo: 'alerta_ponto', municipioId: ponto.municipio_id, pontoId: ponto.id, dados: { alertas } });
    }
    return { ok: true, alertas, led_alerta: alertas.length > 0 };
  }

  private async entrega(ponto: Ponto, e: { protocolo: string; delta_peso_kg: number; peso_kg: number }) {
    if (e.delta_peso_kg < LIMIARES.deltaMinimoKg) {
      throw new UnprocessableEntityException({ erro: 'Peso não detectado', lcd: lcd('Peso nao', 'detectado') });
    }
    const cliente = await this.pool.connect();
    try {
      await cliente.query('BEGIN');
      const { rows } = await cliente.query<{ id: string; cidadao_id: string; voluntario_id: string | null }>(
        `UPDATE solicitacao s SET status = 'entregue', ponto_coleta_id = $3
         WHERE s.municipio_id = $1 AND s.protocolo = $2 AND s.status = 'em_atendimento'
           AND (s.ponto_coleta_id = $3 OR s.ponto_coleta_id IS NULL)
         RETURNING s.id, s.cidadao_id,
           (SELECT voluntario_id FROM oferta WHERE solicitacao_id = s.id AND ativa) AS voluntario_id`,
        [ponto.municipio_id, e.protocolo, ponto.id],
      );
      const s = rows[0];
      if (!s) {
        await cliente.query('ROLLBACK');
        throw new NotFoundException({ erro: 'Protocolo não encontrado', lcd: lcd('Protocolo nao', 'encontrado') });
      }
      await cliente.query(
        `INSERT INTO entrega (solicitacao_id, ponto_coleta_id, origem, delta_peso_kg) VALUES ($1,$2,'sensor',$3)`,
        [s.id, ponto.id, e.delta_peso_kg],
      );
      await notificar(cliente, {
        usuarioId: s.cidadao_id,
        solicitacaoId: s.id,
        tipo: 'doacao_disponivel',
        texto: `Sua doação chegou ao ${ponto.nome}. Leve o protocolo ${e.protocolo} para retirar.`,
      });
      if (s.voluntario_id) {
        await notificar(cliente, {
          usuarioId: s.voluntario_id,
          solicitacaoId: s.id,
          tipo: 'sua_ajuda_chegou',
          texto: `Sua ajuda chegou ao ${ponto.nome}! A família foi avisada para retirar. Obrigado.`,
        });
      }
      await cliente.query('COMMIT');
      this.eventos.emitir({
        tipo: 'entrega_registrada',
        municipioId: ponto.municipio_id,
        pontoId: ponto.id,
        solicitacaoId: s.id,
        protocolo: e.protocolo,
        dados: { delta_peso_kg: e.delta_peso_kg, peso_kg: e.peso_kg },
      });
      return { ok: true, lcd: lcd('Entrega OK!', `Protocolo ${e.protocolo}`) };
    } catch (erro) {
      await cliente.query('ROLLBACK').catch(() => undefined);
      throw erro;
    } finally {
      cliente.release();
    }
  }

  private async retirada(ponto: Ponto, e: { protocolo: string; peso_kg: number }) {
    this.eventos.emitir({ tipo: 'leitura_sensor', municipioId: ponto.municipio_id, pontoId: ponto.id, dados: { peso_kg: e.peso_kg } });
    return { ok: true, lcd: lcd('Retirada', `Protocolo ${e.protocolo}`) };
  }
}

/** Estado dos pontos para o app e o painel (usuário autenticado do município). */
@Controller('pontos')
@UseGuards(AuthGuard)
export class PontosController {
  constructor(@Inject(POOL) private readonly pool: Pool) {}

  @Get()
  async listar(@SessaoAtual() sessao: Sessao) {
    const { rows } = await this.pool.query(
      `SELECT p.id, p.nome, p.endereco, b.nome AS bairro, p.capacidade_kg::float AS capacidade_kg, p.estoque_kg::float AS estoque_kg,
              round(100 * p.estoque_kg / p.capacidade_kg, 1)::float AS ocupacao_pct,
              (ul.payload->>'temperatura_c')::float AS temperatura_c,
              (ul.payload->>'umidade_pct')::float AS umidade_pct,
              ul.recebido_em AS ultima_leitura_em
       FROM ponto_coleta p
       JOIN bairro b ON b.id = p.bairro_id
       LEFT JOIN LATERAL (SELECT payload, recebido_em FROM evento_iot
                          WHERE ponto_coleta_id = p.id AND tipo = 'leitura_sensor'
                          ORDER BY recebido_em DESC LIMIT 1) ul ON true
       WHERE p.municipio_id = $1 ORDER BY p.nome`,
      [sessao.municipioId],
    );
    return rows.map((r) => ({
      ...r,
      alertas: [
        ...(r.temperatura_c > LIMIARES.temperaturaMaxC ? [`Temperatura alta: ${r.temperatura_c} °C`] : []),
        ...(r.umidade_pct > LIMIARES.umidadeMaxPct ? [`Umidade alta: ${r.umidade_pct}%`] : []),
        ...(r.ocupacao_pct < LIMIARES.estoqueBaixoPct ? [`Estoque baixo: ${r.estoque_kg} kg`] : []),
      ],
    }));
  }
}
