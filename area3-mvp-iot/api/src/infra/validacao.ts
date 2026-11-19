import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

/** Valida a entrada com Zod e devolve 400 com mensagens em português. */
export function validar<T extends z.ZodTypeAny>(schema: T, dado: unknown): z.infer<T> {
  const r = schema.safeParse(dado);
  if (!r.success) {
    throw new BadRequestException({
      erro: 'Dados inválidos',
      detalhes: r.error.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message })),
    });
  }
  return r.data;
}
