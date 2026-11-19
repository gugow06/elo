import { Controller, Get, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { POOL } from '../infra/banco.module';

@Controller('saude')
export class SaudeController {
  constructor(@Inject(POOL) private readonly pool: Pool) {}

  @Get()
  async verificar() {
    const inicio = Date.now();
    await this.pool.query('SELECT 1');
    return { status: 'ok', banco: 'ok', latencia_ms: Date.now() - inicio };
  }
}
