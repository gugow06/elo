// Roda antes de cada arquivo de teste: aponta a API e os testes para o banco de teste (ver banco-teste.ts).
import { urlDeTeste } from './banco-teste';

const teste = urlDeTeste();
if (teste) {
  process.env.DATABASE_URL = teste;
  delete process.env.DATABASE_URL_OURO; // a Gestão usa o mesmo banco de teste
}
