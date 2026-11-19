import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
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

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const cabecalho: string | undefined = req.headers?.authorization;
    if (!cabecalho?.startsWith('Bearer ')) throw new UnauthorizedException('Faça login para continuar.');

    let sessao: Sessao;
    try {
      sessao = await lerToken(cabecalho.slice(7));
    } catch {
      throw new UnauthorizedException('Sessão inválida ou expirada. Entre novamente.');
    }

    const permitidos = this.reflector.getAllAndOverride<Perfil[] | undefined>(CHAVE_PERFIS, [ctx.getHandler(), ctx.getClass()]);
    if (permitidos?.length && !permitidos.includes(sessao.perfil)) {
      throw new ForbiddenException('Seu perfil não tem acesso a este recurso.');
    }
    req.sessao = sessao;
    return true;
  }
}
