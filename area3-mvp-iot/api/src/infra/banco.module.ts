import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';
import { criarPool } from '../../db/conexao';

export const POOL = Symbol('POOL');

@Global()
@Module({
  providers: [{ provide: POOL, useFactory: () => criarPool() }],
  exports: [POOL],
})
export class BancoModule implements OnApplicationShutdown {
  constructor(@Inject(POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
