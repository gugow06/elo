/**
 * CORS do navegador (app web e painel). Sem listar os métodos, o padrão do Fastify libera só
 * GET/HEAD/POST e o navegador bloqueia PATCH/PUT/DELETE (trocar foto, editar local, marcar item).
 */
export const OPCOES_CORS = { origin: true, methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'] };
