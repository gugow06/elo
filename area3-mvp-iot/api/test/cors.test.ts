import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApp } from './helpers';

describe('CORS: o navegador (app web e painel) pode usar todos os métodos da API', () => {
  let app: NestFastifyApplication;
  beforeAll(async () => {
    app = await criarApp();
  });
  afterAll(() => app.close());

  it.each(['PUT', 'PATCH', 'DELETE'])('pré-verificação libera %s com autorização e JSON', async (metodo) => {
    const r = await app.inject({
      method: 'OPTIONS',
      url: '/perfil/foto',
      headers: { origin: 'http://127.0.0.1:8090', 'access-control-request-method': metodo, 'access-control-request-headers': 'authorization,content-type' },
    });
    expect(r.statusCode).toBe(204);
    expect(String(r.headers['access-control-allow-methods'])).toContain(metodo);
    expect(r.headers['access-control-allow-origin']).toBe('http://127.0.0.1:8090');
  });
});
