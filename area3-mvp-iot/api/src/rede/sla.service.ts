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
    this.timer = setInterval(() => {
      this.escalar().catch((e) => this.log.error(e.message));
      this.lembrarRetirada().catch((e) => this.log.error(e.message));
    }, intervaloMs);
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

  /**
   * Doação parada no ponto (RETIRADA_LEMBRETE_DIAS, padrão 7): lembra quem pediu, com o código, e
   * avisa a equipe do CRAS do município (técnicos e gestão), uma vez por pedido.
   */
  async lembrarRetirada(dias = Number(process.env.RETIRADA_LEMBRETE_DIAS ?? 7)): Promise<number> {
    const { rows } = await this.pool.query<{ id: string; municipio_id: string; protocolo: string; cidadao_id: string; codigo_retirada: string; ponto: string | null }>(
      `SELECT s.id, s.municipio_id, s.protocolo, s.cidadao_id, s.codigo_retirada, p.nome AS ponto
       FROM solicitacao s LEFT JOIN ponto_coleta p ON p.id = s.ponto_coleta_id
       WHERE s.status IN ('no_mural', 'em_atendimento', 'entregue')
         AND EXISTS (SELECT 1 FROM item_solicitacao i WHERE i.solicitacao_id = s.id AND i.obtido_em IS NULL
                     AND i.entregue_em < now() - make_interval(secs => $1 * 86400))
         AND NOT EXISTS (SELECT 1 FROM notificacao n WHERE n.solicitacao_id = s.id AND n.tipo = 'lembrete_retirada')`,
      [dias],
    );
    for (const s of rows) {
      await this.pool.query(
        `INSERT INTO notificacao (usuario_id, solicitacao_id, tipo, texto) VALUES ($1, $2, 'lembrete_retirada', $3)`,
        [s.cidadao_id, s.id, `Sua doação está esperando no ${s.ponto ?? 'ponto de coleta'}. Para retirar, informe o protocolo ${s.protocolo} e o código ${s.codigo_retirada}.`],
      );
      await this.pool.query(
        `INSERT INTO notificacao (usuario_id, solicitacao_id, tipo, texto)
         SELECT u.id, $2, 'retirada_parada', $3 FROM usuario u WHERE u.municipio_id = $1 AND u.perfil IN ('tecnico', 'gestor')`,
        [s.municipio_id, s.id, `A doação do pedido ${s.protocolo} está no ${s.ponto ?? 'ponto de coleta'} há mais de ${dias} dias sem ser retirada.`],
      );
      this.eventos.emitir({ tipo: 'solicitacao_atualizada', municipioId: s.municipio_id, solicitacaoId: s.id, protocolo: s.protocolo });
    }
    if (rows.length) this.log.log(`${rows.length} lembrete(s) de retirada enviado(s).`);
    return rows.length;
  }
}
