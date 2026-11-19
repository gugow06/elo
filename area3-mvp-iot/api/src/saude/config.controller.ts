import { Controller, Get } from '@nestjs/common';
import { modoDemo } from '../auth/codigos';
import { clientesGoogle } from '../auth/google';

/**
 * Configuração pública para o app e o painel. Em produção, MODO_DEMO=false: some tudo o que é
 * de demonstração (contas de teste na tela de entrar, código de acesso na resposta, avisos).
 */
@Controller('config')
export class ConfigController {
  @Get()
  config() {
    return { modo_demo: modoDemo(), google: clientesGoogle().length > 0 };
  }
}
