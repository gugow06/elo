import { Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Res } from '@nestjs/common';
import { Pool } from 'pg';
import { POOL } from '../infra/banco.module';

/** O que usamos da resposta do Fastify. */
type Resposta = { header(nome: string, valor: string): Resposta; send(corpo: Buffer): unknown };

/** Fotos de perfil são públicas (F7-D5: todos veem). O id muda a cada troca, então o cache é longo. */
@Controller('fotos')
export class FotosController {
  constructor(@Inject(POOL) private readonly pool: Pool) {}

  @Get(':id')
  async foto(@Param('id', new ParseUUIDPipe()) id: string, @Res() res: Resposta) {
    const { rows } = await this.pool.query<{ tipo: string; dados: Buffer }>('SELECT tipo, dados FROM foto_usuario WHERE id = $1', [id]);
    if (!rows[0]) throw new NotFoundException('Foto não encontrada.');
    res.header('content-type', rows[0].tipo).header('cache-control', 'public, max-age=31536000, immutable').send(rows[0].dados);
  }
}
