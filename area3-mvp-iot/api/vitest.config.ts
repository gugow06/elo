import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false,
    // Banco separado (<nome>_teste): os testes nunca apagam os dados do banco de desenvolvimento
    globalSetup: ['test/banco-teste.ts'],
    setupFiles: ['test/ambiente.ts'],
  },
});
