import { Module } from '@nestjs/common';
import { BancoModule } from './infra/banco.module';
import { SaudeController } from './saude/saude.controller';

@Module({
  imports: [BancoModule],
  controllers: [SaudeController],
})
export class AppModule {}
