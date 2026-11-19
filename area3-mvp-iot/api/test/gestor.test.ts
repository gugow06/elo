import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarGestor } from '../db/criar-gestor';
import { auth, criarApp, entrar } from './helpers';

describe('primeiro gestor de um município real (linha de comando)', () => {
  let app: NestFastifyApplication;
  let pool: Pool;

  beforeAll(async () => {
    app = await criarApp();
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  });
  afterAll(async () => {
    await pool.end();
    await app.close();
  });

  it('cria o gestor no município do IBGE e ele entra no painel', async () => {
    const r = await criarGestor(pool, { nome: 'Gestão Salvador', email: 'Gestao.Salvador@example.com', telefone: '(71) 99999-0000', ibge: 2927408 });
    expect(r).toEqual(expect.objectContaining({ municipio: 'Salvador', uf: 'BA' }));
    const token = await entrar(app, '+5571999990000');
    const locais = await app.inject({ method: 'GET', url: '/gestao/locais', headers: auth(token) });
    expect(locais.statusCode).toBe(200);
    expect(locais.json()).toEqual([]);
  });

  it('recusa município inexistente, dados inválidos e duplicados', async () => {
    await expect(criarGestor(pool, { nome: 'X Y Z', email: 'a@example.com', telefone: '+5511999998888', ibge: 1 })).rejects.toThrow(/IBGE/);
    await expect(criarGestor(pool, { nome: 'X Y Z', email: 'invalido', telefone: '+5511999998888', ibge: 2927408 })).rejects.toThrow(/E-mail/);
    await expect(criarGestor(pool, { nome: 'Outra', email: 'gestao.salvador@example.com', telefone: '+5511999997777', ibge: 2927408 })).rejects.toThrow(/Já existe/);
  });
});
