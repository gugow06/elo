import { Module } from '@nestjs/common';
import { AuthController } from './auth/auth.controller';
import { BancoModule } from './infra/banco.module';
import { EventosService } from './infra/eventos.service';
import { SaudeController } from './saude/saude.controller';
import { classificadorProvider } from './solicitacoes/classificador.provider';
import { SolicitacoesController } from './solicitacoes/solicitacoes.controller';
import { SolicitacoesService } from './solicitacoes/solicitacoes.service';
import { TecnicoController } from './tecnico/tecnico.controller';

@Module({
  imports: [BancoModule],
  controllers: [SaudeController, AuthController, SolicitacoesController, TecnicoController],
  providers: [EventosService, classificadorProvider, SolicitacoesService],
})
export class AppModule {}
