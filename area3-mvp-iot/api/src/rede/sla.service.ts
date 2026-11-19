import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { POOL } from '../infra/banco.module';
import { EventosService } from '../infra/eventos.service';

/**
 * P5 / J5: o poder público assume o que a comunidade não assumiu.
 * Pedido verde sem voluntário após o SLA escala para a fila do CRAS.
 * SLA_MURAL_HORAS (padrão 48). Na demonstração, use valores pequenos, como 0.05 (3 minutos).
 */
@Injectable()
export class SlaService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('SLA');
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(POOL) private readonly pool: Pool,
    @Inject(EventosService) private readonly eventos: EventosService,
  ) {}

  onModuleInit(): void {
    if (process.env.SLA_DESLIGADO === 'true') return;
    const intervaloMs = Number(process.env.SLA_INTERVALO_SEGUNDOS ?? 60) * 1000;
    this.timer = setInterval(() => this.escalar().catch((e) => this.log.error(e.message)), intervaloMs);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async escalar(horas = Number(process.env.SLA_MURAL_HORAS ?? 48)): Promise<number> {
    const { rows } = await this.pool.query<{ id: string; municipio_id: string; protocolo: string; cidadao_id: string }>(
      `UPDATE solicitacao SET status = 'na_fila_tecnica', escalado = true
       WHERE status = 'no_mural' AND primeira_resposta_em IS NULL -- só quem ninguém respondeu
         AND criado_em < now() - make_interval(secs => $1 * 3600)
       RETURNING id, municipio_id, protocolo, cidadao_id`,
      [horas],
    );
    for (const s of rows) {
      await this.pool.query(
        `INSERT INTO notificacao (usuario_id, solicitacao_id, tipo, texto) VALUES ($1,$2,'escalado',$3)`,
        [s.cidadao_id, s.id, `A equipe do CRAS assumiu o seu pedido ${s.protocolo} e vai entrar em contato.`],
      );
      this.eventos.emitir({ tipo: 'solicitacao_atualizada', municipioId: s.municipio_id, solicitacaoId: s.id, protocolo: s.protocolo });
    }
    if (rows.length) this.log.log(`${rows.length} pedido(s) escalado(s) ao CRAS por falta de voluntário.`);
    return rows.length;
  }
}
