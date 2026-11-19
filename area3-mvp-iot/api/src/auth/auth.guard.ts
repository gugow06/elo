import {
  CanActivate,
  Inject,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Pool } from 'pg';
import { POOL } from '../infra/banco.module';
import { lerToken, Perfil, Sessao } from './sessao';

const CHAVE_PERFIS = 'elo:perfis';

/** Restringe a rota aos perfis informados. Sem o decorator, basta estar autenticado. */
export const Perfis = (...perfis: Perfil[]) => SetMetadata(CHAVE_PERFIS, perfis);

/** Injeta a sessão do usuário autenticado no handler. */
export const SessaoAtual = createParamDecorator((_: unknown, ctx: ExecutionContext): Sessao => {
  return ctx.switchToHttp().getRequest().sessao;
});

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly reflector = new Reflector();

  constructor(@Inject(POOL) private readonly pool: Pool) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const cabecalho: string | undefined = req.headers?.authorization;
    // EventSource (SSE) não envia cabeçalho: só as rotas /eventos aceitam o token na query.
    const tokenQuery = String(req.url ?? '').split('?')[0].endsWith('/eventos') ? req.query?.token : undefined;
    const token = cabecalho?.startsWith('Bearer ') ? cabecalho.slice(7) : tokenQuery;
    if (!token) throw new UnauthorizedException('Faça login para continuar.');

    let sessao: Sessao;
    try {
      sessao = await lerToken(token);
    } catch {
      throw new UnauthorizedException('Sessão inválida ou expirada. Entre novamente.');
    }

    const permitidos = this.reflector.getAllAndOverride<Perfil[] | undefined>(CHAVE_PERFIS, [ctx.getHandler(), ctx.getClass()]);
    if (permitidos?.length && !permitidos.includes(sessao.perfil)) {
      throw new ForbiddenException('Seu perfil não tem acesso a este recurso.');
    }
    // Conta excluída: a sessão que ainda estava aberta deixa de valer na hora
    const conta = await this.pool.query<{ excluido_em: Date | null }>('SELECT excluido_em FROM usuario WHERE id = $1', [sessao.usuarioId]);
    if (!conta.rows[0] || conta.rows[0].excluido_em) throw new UnauthorizedException('Esta conta foi excluída.');
    req.sessao = sessao;
    return true;
  }
}
