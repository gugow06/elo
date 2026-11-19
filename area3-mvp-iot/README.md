# Área 3 — MVP, IoT e experiência digital

| Pasta | O que é | Como rodar |
| --- | --- | --- |
| [`api/`](api/) | API NestJS + Fastify + PostgreSQL: login sem senha, solicitações com triagem, mural, ofertas, entregas, IoT, gestão | `docker compose up -d` (raiz) · `pnpm --filter @elo/api dev` |
| [`painel/`](painel/) | Painel web Next.js: fila do técnico do CRAS e dashboard de gestão | http://localhost:3000 · `pnpm --filter @elo/painel dev` |
| [`app/`](app/) | App Flutter (Android, iOS e web) para cidadão e voluntário, seguindo o mockup | [`app/README.md`](app/README.md) |
| [`iot/`](iot/) | Ponto de Coleta Inteligente: sketch Arduino (Tinkercad), simulador e ponte serial | [`iot/README.md`](iot/README.md) |

## Telas (mais de 4, rubrica item 01)

**App:** boas-vindas, login, início, mapa da rede (mapa e lista), pedido de ajuda, pedir ajuda, confirmação com protocolo, meus pedidos / minhas ajudas, mensagens e perfil.

**Painel:** login, fila do CRAS, ficha do pedido (relato, histórico, reclassificação, conclusão) e gestão (5 abas).

## IoT: 2 sensores (rubrica item 02)

Balança (peso) e temperatura no Ponto de Coleta Inteligente. Veja [`iot/README.md`](iot/README.md).

## Fluxo funcional completo (rubrica item 03)

1. **Ana** (app) pede ajuda → a triagem classifica como verde → protocolo de 6 dígitos.
2. **Cláudia** (app) vê o mural do bairro → "Quero ajudar" → recebe o protocolo e o ponto de coleta.
3. **Ponto de coleta** (IoT): protocolo no teclado + doação na balança → API registra a entrega.
4. Ana recebe "Sua doação chegou" e confirma a retirada; Cláudia recebe **"Sua ajuda chegou"**.
5. **Gestão** (painel) vê o estoque mudar ao vivo e os indicadores do bairro.

Contraprova: um relato com indício de violência vai direto para a fila do técnico, com alerta, e nunca aparece no mural.

## Arquitetura (rubrica item 04)

[`docs/ARQUITETURA.md`](../docs/ARQUITETURA.md).

## Endpoints principais da API

| Método | Rota | Perfil | Função |
| --- | --- | --- | --- |
| POST | `/auth/codigo`, `/auth/entrar` | público | Login sem senha: código por e-mail (Resend) no app; por telefone (SMS simulado) no painel |
| POST | `/auth/cadastro` | público | Cria conta do app, sem escolha de perfil: todo usuário pede e oferece ajuda (com ou sem Google; sem Google, confirma o e-mail por código) |
| POST | `/auth/social` | público | Login com Google: confere o ID token (`GOOGLE_CLIENT_IDS`) |
| GET | `/auth/bairros` | público | Bairros para a tela de criar conta |
| POST | `/solicitacoes` | usuário do app | Pedir ajuda (com triagem) |
| GET | `/solicitacoes/minhas` | usuário do app | Meus pedidos |
| GET | `/solicitacoes/consulta/{protocolo}?nascimento=` | público | Consulta sem login |
| POST | `/solicitacoes/{id}/confirmar-recebimento` | usuário do app | Retirada confirmada |
| GET | `/mural`, `/mural/bairros` | usuário do app | Mural do bairro (sem dados pessoais e sem os próprios pedidos) |
| POST | `/mural/{id}/ofertas` | usuário do app | Quero ajudar (nunca no próprio pedido) |
| GET | `/voluntario/ofertas` | usuário do app | Minhas ajudas + desfecho |
| GET | `/tecnico/fila`, `/tecnico/solicitacoes/{id}` | técnico | Fila e ficha (leitura auditada) |
| POST | `/tecnico/solicitacoes/{id}/reclassificar`, `/concluir` | técnico | Reclassificação e desfecho |
| GET | `/tecnico/eventos` | técnico, gestor | Tempo real (SSE) |
| GET/POST | `/iot/pontos/{id}/…` | dispositivo | Ponto de Coleta Inteligente |
| GET | `/gestao/*` | gestor, técnico | Dashboard (camada ouro) |
