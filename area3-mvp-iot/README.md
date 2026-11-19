# Área 3 — MVP, IoT e experiência digital

| Pasta | O que é | Como rodar |
| --- | --- | --- |
| [`api/`](api/) | API NestJS + Fastify + PostgreSQL: login sem senha, solicitações com triagem, mural, ofertas, entregas, IoT, gestão | `docker compose up -d` (raiz) · `pnpm --filter @elo/api dev` |
| [`painel/`](painel/) | Painel web Next.js: fila do técnico do CRAS, gestão, e receber/retirar doação e registro para o agente do ponto | http://localhost:3000 · `pnpm --filter @elo/painel dev` |
| [`app/`](app/) | App Flutter (Android, iOS e web) para o cidadão, que pede e ajuda, seguindo o mockup | [`app/README.md`](app/README.md) |
| [`iot/`](iot/) | Ponto de Coleta Inteligente: sketch Arduino (Wokwi e Tinkercad), simulador e ponte serial | [`iot/README.md`](iot/README.md) |

## Telas (mais de 4, rubrica item 01)

**App:** boas-vindas, entrar, criar conta (com aceite dos termos), início pela localização (banners, atalhos e pedidos próximos), mapa da rede ("Você está aqui", mapa e lista), todos os pedidos, detalhe do pedido e "Quero ajudar", pedir ajuda, confirmação com protocolo e código de retirada, meus pedidos / minhas ajudas, mensagens (conversas e notificações do sistema), conversa, perfil (privacidade, termos, política e excluir conta).

**Painel:** entrar, fila do CRAS, ficha do pedido (relato, histórico, reclassificação, conclusão), gestão (5 abas), locais da rede, equipe, receber doação, retirar doação e registro.

## IoT: 2 sensores (rubrica item 02)

Balança (peso) e temperatura no Ponto de Coleta Inteligente. Veja [`iot/README.md`](iot/README.md).

## Fluxo funcional completo (rubrica item 03)

1. **Ana** (app) pede ajuda → a triagem classifica como verde → protocolo de 6 dígitos.
2. **Cláudia** (app) vê o mural do bairro → "Quero ajudar" → recebe o protocolo e o ponto de coleta.
3. **Ponto de coleta** (IoT): protocolo no teclado + doação na balança → API registra a entrega. Sem o sensor, a agente registra em **Receber doação** no painel.
4. Ana recebe "Sua doação está no ponto"; Cláudia recebe **"Sua ajuda chegou"**. As duas podem conversar pela aba Mensagens.
5. Ana retira com o **código de retirada** (4 números, só dela), no teclado do ponto ou com a agente em **Retirar doação**. O pedido conclui e tudo fica no **Registro**.
6. **Gestão** (painel) vê o estoque mudar ao vivo e os indicadores do bairro.

Contraprova: um relato com indício de violência vai direto para a fila do técnico, com alerta, e nunca aparece no mural.

## Arquitetura (rubrica item 04)

[`docs/ARQUITETURA.md`](../docs/ARQUITETURA.md).

## Rodar com dados reais (sem modo demonstração)

O ELO roda local, mas pronto para produção: tudo é configurado por variável de ambiente.

1. No `.env`: `MODO_DEMO=false` e `SEED_DEMO=false` (sem contas de teste, sem código na tela, sem dados fictícios), `RESEND_API_KEY` e `RESEND_FROM` de um domínio verificado no Resend, `GOOGLE_CLIENT_IDS`, `PAINEL_URL`.
2. `docker compose up -d --build`. Ao subir, a API aplica as migrações e importa os 27 estados e 5.571 municípios do IBGE (`pnpm db:ibge`).
3. Crie o primeiro gestor do município (código IBGE em `area3-mvp-iot/api/db/dados/municipios.csv`):

   ```bash
   docker compose exec api pnpm gestor:criar --nome "Secretaria de Assistência Social" \
     --email gestao@prefeitura.gov.br --telefone +5571999990000 --ibge 2927408
   ```

4. O gestor entra no painel com o e-mail, cadastra os **Locais da rede** (pelo nome do lugar ou endereço) e convida a **Equipe**.
5. Moradores criam conta no app escolhendo a cidade e o bairro. Mapa e busca de endereço usam serviços gratuitos do OpenStreetMap; para tráfego real, aponte `MAP_TILES` (app) e `GEOCODER_URL` (API) para um servidor próprio ou um plano com chave.

## Endpoints principais da API

| Método | Rota | Perfil | Função |
| --- | --- | --- | --- |
| GET | `/config` | público | Se a API está em modo demonstração (`MODO_DEMO`) e se o Google está configurado |
| POST | `/auth/codigo`, `/auth/entrar` | público | Login sem senha: e-mail + código de 6 dígitos (Resend), no app e no painel |
| POST | `/auth/cadastro` | público | Cria conta do app em qualquer cidade (bairro da lista ou digitado), sem escolha de perfil; com Google entra direto, sem ele confirma o e-mail |
| POST | `/auth/social`, `/auth/social/confirmar` | público | Login com Google (ID token conferido em `GOOGLE_CLIENT_IDS`); com verificação em duas etapas ativa, pede também o código do e-mail |
| GET | `/auth/bairros?municipio=` | público | Bairros de uma cidade, para criar conta |
| GET | `/localidades?q=` | público | Estados e cidades do IBGE, sem acento |
| GET | `/geo/buscar?q=` | logado | Endereço ou nome de lugar → coordenadas (Photon/OpenStreetMap, gratuito, com cache e 1 consulta/s) |
| GET/POST | `/perfil`, `/perfil/2fa/codigo`, `/ativar`, `/desativar` | logado | Perfil e verificação da conta (duas etapas por e-mail = verificado) |
| PUT/DELETE | `/perfil/foto` | logado | Envia (JPG, PNG ou WebP em base64, até 1,5 MB) ou remove a foto de perfil |
| GET | `/fotos/{id}` | público | Foto de perfil (todos veem); o id muda a cada troca |
| POST | `/solicitacoes` | usuário do app | Pedir ajuda (com triagem) |
| GET | `/solicitacoes/minhas` | usuário do app | Meus pedidos |
| GET | `/solicitacoes/consulta/{protocolo}?nascimento=` | público | Consulta sem login |
| POST | `/solicitacoes/{id}/confirmar-recebimento` | usuário do app | Retirada confirmada |
| PATCH | `/solicitacoes/{id}/itens/{itemId}` | quem pediu | Marca o item como recebido; com tudo marcado, o pedido conclui |
| POST | `/solicitacoes/{id}/encerrar` | quem pediu | "Já consegui o que precisava": encerra o pedido (sai do mural e do mapa) e avisa quem estava ajudando |
| GET | `/mural?uf=&municipio=&categoria=&ordem=&pagina=&abrangencia=brasil&lat=&lon=` | usuário do app | Pedidos com itens, "N pessoas ajudando" e primeiro nome + foto de até 5 delas, em qualquer lugar do Brasil (sem dados pessoais, sem faixa de risco, sem os próprios pedidos) |
| POST | `/mural/{id}/ofertas` | usuário do app | Quero ajudar com os itens escolhidos (nunca no próprio pedido; móvel: uma pessoa) |
| GET | `/voluntario/ofertas` | usuário do app | Minhas ajudas: o que levar, endereço, horário e telefone do ponto, protocolo, instruções e desfecho |
| GET | `/mapa/locais?bbox=`, `/mapa/pedidos?bbox=` | logado | Locais da rede na área do mapa; pedidos só agregados por bairro |
| GET/POST/PATCH | `/gestao/locais` | gestor (técnico só lê) | Locais da rede: ponto de coleta, assistência, abrigo, distribuição, saúde |
| GET/POST | `/gestao/equipe` | gestor | Equipe do painel: convida técnicos, gestores e agentes dos pontos de coleta |
| GET | `/agente/pontos`, `/agente/pedidos/{protocolo}` | agente, técnico, gestor | Receber doação: pelo protocolo, o que o pedido precisa e quem combinou levar o quê (só primeiro nome) |
| POST | `/agente/pedidos/{protocolo}/retiradas` | agente, técnico, gestor | Quem pediu retira no ponto: confere o código de retirada (4 números, só de quem pediu; 5 erros = 1 hora de bloqueio) e marca o que foi levado; com tudo retirado, conclui |
| GET | `/geo/onde-estou?lat=&lon=` | público | Localização do aparelho (com permissão) → cidade do IBGE e bairro, para criar a conta; a posição não é guardada |
| POST | `/agente/pedidos/{protocolo}/entregas` | agente, técnico, gestor | Registra o que chegou ao ponto, com quantidade (o mesmo item pode chegar de novo); avisa quem pediu e quem trouxe |
| GET | `/agente/registro` | agente, técnico, gestor | Registro (log) de entregas, retiradas e códigos errados, com quem registrou e onde |
| GET/POST | `/conversas`, `/conversas/nao-lidas`, `/conversas/{id}/mensagens` | usuário do app | Conversa entre quem pediu e quem está ajudando (só os dois; até 1000 caracteres) |
| POST | `/perfil/termos` | usuário do app | Aceita a versão atual dos Termos de Uso e da Política de Privacidade (a versão aceita aparece em `GET /perfil`) |
| POST | `/perfil/excluir/codigo`, `/perfil/excluir` | usuário do app | Exclusão de conta confirmada por código: cancela pedidos e ajudas, apaga os dados pessoais e anonimiza o histórico |
| GET | `/tecnico/fila`, `/tecnico/solicitacoes/{id}` | técnico | Fila e ficha (leitura auditada) |
| POST | `/tecnico/solicitacoes/{id}/reclassificar`, `/concluir` | técnico | Reclassificação e desfecho |
| GET | `/tecnico/eventos` | técnico, gestor | Tempo real (SSE) |
| GET/POST | `/iot/pontos/{id}/…` | dispositivo | Ponto de Coleta Inteligente |
| GET | `/gestao/*` | gestor, técnico | Dashboard (camada ouro) |
