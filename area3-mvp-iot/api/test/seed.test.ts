import { describe, expect, it } from 'vitest';
import { cpfFicticio } from '../db/seed';

describe('seed de demonstração', () => {
  it('gera CPF fictício com dígitos verificadores válidos', () => {
    // 111.444.777-35 é o exemplo clássico de CPF válido para testes
    expect(cpfFicticio('111444777')).toBe('11144477735');
  });
});
