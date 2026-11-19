import { Module } from '@nestjs/common';
import { AuthController } from './auth/auth.controller';
import { BancoModule } from './infra/banco.module';
import { EventosService } from './infra/eventos.service';
import { GeoController } from './geo/geo.controller';
import { GestaoController, PoolOuro } from './gestao/gestao.controller';
import { IotController, PontosController } from './iot/iot.controller';
import { PerfilController } from './perfil/perfil.controller';
import { RedeController } from './rede/rede.controller';
import { SlaService } from './rede/sla.service';
import { SaudeController } from './saude/saude.controller';
import { classificadorProvider } from './solicitacoes/classificador.provider';
import { SolicitacoesController } from './solicitacoes/solicitacoes.controller';
import { SolicitacoesService } from './solicitacoes/solicitacoes.service';
import { TecnicoController } from './tecnico/tecnico.controller';

@Module({
  imports: [BancoModule],
  controllers: [
    SaudeController,
    AuthController,
    SolicitacoesController,
    TecnicoController,
    RedeController,
    IotController,
    PontosController,
    GestaoController,
    PerfilController,
    GeoController,
  ],
  providers: [EventosService, classificadorProvider, SolicitacoesService, SlaService, PoolOuro],
})
export class AppModule {}
