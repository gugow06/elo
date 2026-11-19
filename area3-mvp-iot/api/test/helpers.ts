import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { migrar } from '../db/migrar';
import { seed } from '../db/seed';

export const TELEFONES = {
  ana: '+5511990000001',
  claudia: '+5511990000004',
  fernanda: '+5511990000006',
  gestor: '+5511990000007',
  tecnicoOutroMunicipio: '+5511990000009',
};

export async function criarApp(): Promise<NestFastifyApplication> {
  process.env.JWT_SECRET ??= 'segredo-de-teste-com-mais-de-16';
  process.env.MODO_DEMO = 'true';
  delete process.env.LLM_URL; // testes usam sempre o classificador offline
  await migrar();
  await seed();
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), { logger: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

export async function entrar(app: NestFastifyApplication, telefone: string): Promise<string> {
  const c = await app.inject({ method: 'POST', url: '/auth/codigo', payload: { telefone } });
  const { codigo_demo } = c.json();
  const e = await app.inject({ method: 'POST', url: '/auth/entrar', payload: { telefone, codigo: codigo_demo } });
  return e.json().token;
}

export const auth = (token: string) => ({ authorization: `Bearer ${token}` });
