import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { OPCOES_CORS } from './infra/cors';
import { LIMITE_CORPO } from './perfil/fotos';
import { completarBairrosSemPosicao } from './geo/bairros';
import { POOL } from './infra/banco.module';

async function iniciar() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ logger: false, bodyLimit: LIMITE_CORPO }));
  app.enableCors(OPCOES_CORS);
  app.enableShutdownHooks();
  const porta = Number(process.env.PORT ?? 3333);
  await app.listen(porta, '0.0.0.0');
  console.log(`API do ELO ouvindo em http://localhost:${porta}`);
  // Em segundo plano: posição dos bairros digitados no cadastro (para o mapa de pedidos)
  void completarBairrosSemPosicao(app.get(POOL)).catch(() => undefined);
}

iniciar();
