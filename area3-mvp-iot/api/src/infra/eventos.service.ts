import { Injectable } from '@nestjs/common';
import { filter, Observable, Subject } from 'rxjs';

export interface EventoElo {
  tipo: 'alerta_vermelho' | 'solicitacao_criada' | 'solicitacao_atualizada' | 'entrega_registrada' | 'leitura_sensor' | 'alerta_ponto';
  municipioId: string;
  solicitacaoId?: string;
  protocolo?: string;
  pontoId?: string;
  dados?: Record<string, unknown>;
}

/** Barramento de eventos em memória. O painel recebe os eventos por Server-Sent Events. */
@Injectable()
export class EventosService {
  private readonly fluxo = new Subject<EventoElo>();

  emitir(evento: EventoElo): void {
    this.fluxo.next(evento);
  }

  doMunicipio(municipioId: string): Observable<EventoElo> {
    return this.fluxo.asObservable().pipe(filter((e) => e.municipioId === municipioId));
  }
}
